import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
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
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

const ACTIVITY_THRESHOLD_MS = 100000;

export default function RADashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

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

  // Fetch constituencies, auto-refreshing every 10 seconds for live tracking!
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['ra-assignments', currentUser?.id],
    queryFn: async () => {
      const { data: constData, error: constErr } = await supabase
        .from('constituencies')
        .select(`
          id, 
          eci_name, 
          tool_name, 
          states(name),
          assigned_ra_id
        `)
        .eq('assigned_ra_id', currentUser.id)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });

      if (constErr) throw constErr;

      // Get the constituency IDs we need
      const constIds = constData?.map(c => c.id) || [];

      // Separately fetch election data for these constituencies
      const { data: electionData, error: electionErr } = await supabase
        .from('election_data')
        .select('constituency_id, eci_round, tool_round, eci_round_updated_at, tool_round_updated_at')
        .in('constituency_id', constIds);

      if (electionErr) throw electionErr;

      // Merge election data into constituencies
      const electionMap = {};
      electionData?.forEach(e => {
        electionMap[e.constituency_id] = e;
      });

      return constData?.map(c => ({
        ...c,
        election_data: [electionMap[c.id]] || [{ eci_round: 0, tool_round: 0 }]
      })) || [];
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000,
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
    const channel = supabase.channel('ra-election-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_data' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ra-assignments', currentUser?.id] });
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [queryClient, currentUser?.id]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Search state for filtering assignments list
  const [search, setSearch] = useState('');

  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    const q = (search || '').trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter(a => {
      const name = (a.eci_name || '').toLowerCase();
      const state = (a.states?.name || '').toLowerCase();
      return name.includes(q) || state.includes(q);
    });
  }, [assignments, search]);

  const getSyncStatus = (eci, tool) => {
    const diff = eci - tool;
    if (eci === 0 && tool === 0) return { label: 'Not Started', styles: { backgroundColor: '#f3f4f6', color: '#6b7280' } };
    if (diff > 0) return { label: `ECI +${diff}`, styles: { backgroundColor: '#fee2e2', color: '#991b1b' } };
    if (diff < 0) return { label: `Tool +${Math.abs(diff)}`, styles: { backgroundColor: '#fef3c7', color: '#92400e' } };
    return { label: 'In Sync', styles: { backgroundColor: '#d1fae5', color: '#059669' } };
  };

  const getActivityStatus = (eciRoundUpdatedAt, toolRoundUpdatedAt) => {
    const eciMs = eciRoundUpdatedAt ? new Date(eciRoundUpdatedAt).getTime() : null;
    const toolMs = toolRoundUpdatedAt ? new Date(toolRoundUpdatedAt).getTime() : null;
    return {
      eciActive: !!eciMs && (Date.now() - eciMs <= ACTIVITY_THRESHOLD_MS),
      toolActive: !!toolMs && (Date.now() - toolMs <= ACTIVITY_THRESHOLD_MS),
    };
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
                Auto-refreshing every 30s
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
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAssignments?.map((row) => {
                    const data = row.election_data?.[0] || { eci_round: 0, tool_round: 0 };
                    const status = getSyncStatus(data.eci_round, data.tool_round);
                    const activity = getActivityStatus(data.eci_round_updated_at, data.tool_round_updated_at);

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
                          {row.eci_name}
                        </TableCell>
                        <TableCell sx={{ py: 1, color: '#64748b' }}>
                          {row.states?.name}
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
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
                            ...status.styles
                          }}>
                            {status.label}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: activity.eciActive ? '#10b981' : '#ef4444' }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>ECI</Typography>
                            </Box>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: activity.toolActive ? '#10b981' : '#ef4444' }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>TOOL</Typography>
                            </Box>
                          </Box>
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