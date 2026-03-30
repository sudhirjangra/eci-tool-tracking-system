import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { createBufferedQueryPatchScheduler, patchNestedElectionRows } from '../../lib/electionRealtime';
import {
  getActivityFlags,
  getConstituencyName,
  getLagBucket,
  getLagSeconds,
  getSyncStatus,
  formatLag,
  formatTimestamp,
  getSortTimestamp,
} from '../../lib/electionMetrics';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Typography,
  Chip,
  CircularProgress,
  TextField,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

export default function RADashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSyncStatus, setFilterSyncStatus] = useState('All');
  const [filterLag, setFilterLag] = useState('All');
  const [filterUpdate, setFilterUpdate] = useState('All');
  const [sortBy, setSortBy] = useState('name');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
      if (!data.user) navigate('/login');
    });
  }, [navigate]);

  // Fetch user name from user_roles
  const { data: userInfo } = useQuery({
    queryKey: ['user-info', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('name, email')
        .eq('id', currentUser.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id,
  });

  // Fetch assigned constituencies with nested election data in a single query.
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['ra-assignments', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('constituencies')
        .select(`
          id, 
          state_id,
          eci_id,
          tool_name, 
          states(name),
          assigned_ra_id,
          election_data(
            constituency_id,
            eci_round,
            tool_round,
            eci_round_updated_at,
            tool_round_updated_at,
            eci_updated_at
          )
        `)
        .eq('assigned_ra_id', currentUser.id)
        .order('states(name)', { ascending: true })
        .order('tool_name', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser?.id,
    staleTime: 30000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 60000,
  });

  // Fetch the RA's manager (TL)
  const { data: tlInfo } = useQuery({
    queryKey: ['ra-tl', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('manager_id')
        .eq('id', currentUser.id)
        .single();
      if (error) throw error;
      if (data?.manager_id) {
        // Fetch manager's name and email from user_roles
        const { data: tlData, error: tlErr } = await supabase
          .from('user_roles')
          .select('email, name')
          .eq('id', data.manager_id)
          .single();
        if (tlErr) throw tlErr;
        return { 
          email: tlData?.email || 'N/A', 
          name: tlData?.name || tlData?.email || 'N/A' 
        };
      }
      return null;
    },
    enabled: !!currentUser?.id,
  });

  // Real-time subscription for live updates on election_data
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!currentUser?.id) return undefined;

    const scheduler = createBufferedQueryPatchScheduler(
      queryClient,
      ['ra-assignments', currentUser.id],
      patchNestedElectionRows,
    );

    // Create unique channel name with timestamp and user ID to avoid conflicts
    const channelName = `ra-election-${currentUser.id}-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'election_data' }, (payload) => {
        scheduler.push(payload);
      })
      .subscribe((status, err) => {
        if (err) {
          console.warn(`[RADashboard] Real-time subscription error: ${err.message}`);
        } else if (status === 'SUBSCRIBED') {
          console.log(`[RADashboard] Real-time subscription active: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[RADashboard] Channel error: ${channelName}`);
        }
      });

    return () => {
      scheduler.dispose();
      supabase.removeChannel(channel);
    };
  }, [queryClient, currentUser?.id]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    const q = (search || '').trim().toLowerCase();
    let rows = assignments.map((assignment) => {
      const election = assignment.election_data?.[0] || {};
      const constituencyName = getConstituencyName(assignment);
      const lagSeconds = getLagSeconds(election.eci_updated_at, now);
      const activity = getActivityFlags(election.eci_round_updated_at, election.tool_round_updated_at, now);
      const syncStatus = getSyncStatus(election.eci_round ?? 0, election.tool_round ?? 0);

      return {
        ...assignment,
        constituencyName,
        lagSeconds,
        lagBucket: getLagBucket(lagSeconds),
        hasEciUpdate: Boolean(election.eci_updated_at),
        syncStatus,
        activity,
        election,
      };
    });

    if (q) {
      rows = rows.filter((assignment) => {
        const name = assignment.constituencyName.toLowerCase();
        const state = (assignment.states?.name || '').toLowerCase();
        return name.includes(q) || state.includes(q);
      });
    }

    if (filterStatus !== 'All') {
      rows = rows.filter((assignment) => assignment.activity.status === filterStatus);
    }

    if (filterSyncStatus !== 'All') {
      rows = rows.filter((assignment) => assignment.syncStatus === filterSyncStatus);
    }

    if (filterLag !== 'All') {
      rows = rows.filter((assignment) => assignment.lagBucket === filterLag);
    }

    if (filterUpdate !== 'All') {
      rows = rows.filter((assignment) => filterUpdate === 'Has Update' ? assignment.hasEciUpdate : !assignment.hasEciUpdate);
    }

    rows.sort((left, right) => {
      if (sortBy === 'updated-desc') {
        return getSortTimestamp(right.election.eci_updated_at) - getSortTimestamp(left.election.eci_updated_at);
      }

      if (sortBy === 'updated-asc') {
        return getSortTimestamp(left.election.eci_updated_at) - getSortTimestamp(right.election.eci_updated_at);
      }

      if (sortBy === 'lag-desc') {
        return (right.lagSeconds ?? -1) - (left.lagSeconds ?? -1);
      }

      if (sortBy === 'lag-asc') {
        return (left.lagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.lagSeconds ?? Number.MAX_SAFE_INTEGER);
      }

      return left.constituencyName.localeCompare(right.constituencyName);
    });

    return rows;
  }, [assignments, filterLag, filterStatus, filterSyncStatus, filterUpdate, now, search, sortBy]);

  const getSyncStatusChip = (status) => {
    if (status === 'In Sync') return { backgroundColor: '#d1fae5', color: '#059669' };
    if (status === 'Not Started') return { backgroundColor: '#f3f4f6', color: '#6b7280' };
    if (status.startsWith('ECI +')) return { backgroundColor: '#fee2e2', color: '#991b1b' };
    return { backgroundColor: '#fef3c7', color: '#92400e' };
  };

  const getLagChip = (seconds) => {
    if (seconds === null || seconds === undefined) return { backgroundColor: '#e2e8f0', color: '#64748b' };
    if (seconds <= 60) return { backgroundColor: '#d1fae5', color: '#047857' };
    if (seconds <= 300) return { backgroundColor: '#fef3c7', color: '#92400e' };
    return { backgroundColor: '#fee2e2', color: '#991b1b' };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: '#f0f4f8', overflow: 'hidden' }}>
      {/* Top Navigation Header */}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
        color: '#fff',
        px: 4,
        py: 2.5,
        borderBottom: '2px solid #1a5a8e',
        boxShadow: '0 4px 12px rgba(15, 76, 117, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Logo/Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{
            width: 44,
            height: 44,
            bgcolor: 'rgba(255,255,255,0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            border: '2px solid rgba(255,255,255,0.3)'
          }}>
            R
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 'bold', lineHeight: 1 }}>Elections 2026</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>RESEARCH ANALYST DASHBOARD</Typography>
          </Box>
        </Box>

        {/* User Info & Logout */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right', pr: 2, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{userInfo?.name || 'Research Analyst'}</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>{userInfo?.email || currentUser?.email}</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8 }}>Reports to: {tlInfo?.name ? `${tlInfo.name} - ${tlInfo.email}` : tlInfo?.email || 'N/A'}</Typography>
          </Box>
          <Button
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
            sx={{ 
              color: '#fff', 
              textTransform: 'none',
              fontSize: '0.9rem',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' }
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5, bgcolor: '#f0f4f8' }}>
        {/* Page Title */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75' }}>
              My Assigned Territories
            </Typography>
            <Box sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 2.5,
              py: 1,
              backgroundColor: '#dbeafe',
              border: '1px solid #60a5fa',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#2563eb'
            }}>
              <Box sx={{
                width: 6,
                height: 6,
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }} />
              Live Updates Active
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
            Monitor your assigned constituencies in real-time
          </Typography>
        </Box>

        {/* Main Table Card */}
        <Box sx={{
          bgcolor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15,76,117,0.10)',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 60px)',
          maxWidth: '100%'
        }}>
          <Box sx={{
            p: 2,
            bgcolor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f4c75' }}>
              Your Assigned Territories ({assignments?.length || 0})
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                label="Search Constituency or State"
                variant="outlined"
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 220 }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Status</InputLabel>
                <Select value={filterStatus} label="Status" onChange={(event) => setFilterStatus(event.target.value)}>
                  <MenuItem value="All">All Statuses</MenuItem>
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Sync Status</InputLabel>
                <Select value={filterSyncStatus} label="Sync Status" onChange={(event) => setFilterSyncStatus(event.target.value)}>
                  <MenuItem value="All">All Sync Status</MenuItem>
                  <MenuItem value="In Sync">In Sync ✓</MenuItem>
                  <MenuItem value="Not Started">Not Started</MenuItem>
                  <MenuItem value="ECI +1">ECI Ahead</MenuItem>
                  <MenuItem value="Tool +1">Tool Ahead</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>ECI Lag</InputLabel>
                <Select value={filterLag} label="ECI Lag" onChange={(event) => setFilterLag(event.target.value)}>
                  <MenuItem value="All">All Lags</MenuItem>
                  <MenuItem value="Fresh">Fresh</MenuItem>
                  <MenuItem value="Aging">Aging</MenuItem>
                  <MenuItem value="Stale">Stale</MenuItem>
                  <MenuItem value="Unknown">Unknown</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>ECI Update</InputLabel>
                <Select value={filterUpdate} label="ECI Update" onChange={(event) => setFilterUpdate(event.target.value)}>
                  <MenuItem value="All">All Updates</MenuItem>
                  <MenuItem value="Has Update">Has Update</MenuItem>
                  <MenuItem value="No Update">No Update</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>Sort</InputLabel>
                <Select value={sortBy} label="Sort" onChange={(event) => setSortBy(event.target.value)}>
                  <MenuItem value="name">Constituency Name</MenuItem>
                  <MenuItem value="updated-desc">Latest ECI Update</MenuItem>
                  <MenuItem value="updated-asc">Oldest ECI Update</MenuItem>
                  <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
                  <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2.5,
                py: 1.2,
                backgroundColor: '#e0f2fe',
                border: '1px solid #7dd3fc',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#0c4a6e'
              }}>
                <InfoIcon sx={{ fontSize: '1rem' }} />
                Supabase realtime connected
              </Box>
            </Box>
          </Box>

          {/* Table Content */}
          {isLoading ? (
            <Box sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2
            }}>
              <CircularProgress size={50} sx={{ color: '#00a86b' }} />
              <Typography sx={{ color: '#64748b', fontWeight: 600 }}>
                Connecting to live feed...
              </Typography>
            </Box>
          ) : assignments?.length === 0 ? (
            <Box sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              p: 4
            }}>
              <Box sx={{ fontSize: '3rem', mb: 2 }}>📍</Box>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                No Territories Assigned
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                Waiting for your Team Leader to delegate territories to you
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      Constituency
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      State
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      ECI Round
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      Tool Round
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      Sync Status
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      ECI / Tool
                      Activity
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      ECI Last Updated
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                      ECI Lag
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAssignments?.map((row) => {
                    const data = row.election || { eci_round: 0, tool_round: 0 };

                    return (
                      <TableRow
                        key={row.id}
                        sx={{
                          '&:hover': { bgcolor: '#f8fafc' },
                          transition: 'all 0.2s ease',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        <TableCell sx={{ py: 1, fontWeight: 600, color: '#0f4c75' }}>
                          {row.constituencyName}
                        </TableCell>
                        <TableCell sx={{ py: 1, color: '#64748b' }}>
                          {row.states?.name}
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                            <Chip
                              label={data.eci_round}
                              size="small"
                              sx={{
                                bgcolor: '#e0e7ff',
                                color: '#4f46e5'
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Chip
                              label={data.tool_round}
                              size="small"
                              sx={{
                                bgcolor: '#fce7f3',
                                color: '#be185d'
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            ...getSyncStatusChip(row.syncStatus)
                          }}>
                            {row.syncStatus}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: row.activity.eciActive ? '#10b981' : '#ef4444' }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>ECI</Typography>
                            </Box>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: row.activity.toolActive ? '#10b981' : '#ef4444' }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>TOOL</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Typography variant="body2" sx={{ color: '#334155', fontSize: '0.82rem' }}>
                            {formatTimestamp(data.eci_updated_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Chip
                            label={formatLag(row.lagSeconds)}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              ...getLagChip(row.lagSeconds),
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </Box>
  );
}
