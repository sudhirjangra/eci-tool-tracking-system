import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { fetchConstituenciesWithElectionData } from '../../lib/constituencyData';
import { createBufferedQueryPatchScheduler, patchNestedElectionRows } from '../../lib/electionRealtime';
import {
  compareConstituencyNames,
  compareRoundDifference,
  getActivityFlags,
  getConstituencyName,
  getLagBucket,
  getLagSeconds,
  getSyncStatus,
  getSyncStatusDelta,
  formatLag,
  formatTimestamp,
  getSortTimestamp,
  pickLatestElectionRow,
} from '../../lib/electionMetrics';
import {
  dashboardContentSx,
  dashboardControlSx,
  dashboardHeaderSx,
  dashboardIntroSx,
  dashboardSearchSx,
  dashboardShellSx,
  dashboardTableCardSx,
  dashboardTableHeadCellSx,
  dashboardTableRowSx,
  getLagPalette,
  getSortLabel,
  getSyncStatusPalette,
  liveBadgeSx,
} from '../../lib/dashboardUi';
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
  const deferredSearch = useDeferredValue(search);
  const [filterState, setFilterState] = useState('All');
  const [filterSyncStatus, setFilterSyncStatus] = useState('All');
  const [sortBy, setSortBy] = useState('lag-desc');
  const [now, setNow] = useState(Date.now());
  const [authReady, setAuthReady] = useState(false);
  const trackedConstituencyIdsRef = useRef(new Set());
  const electionCacheRef = useRef(new Map());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const nextUser = data.session?.user ?? null;
      setCurrentUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        navigate('/login', { replace: true });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const nextUser = session?.user ?? null;
      setCurrentUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        navigate('/login', { replace: true });
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
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
      return fetchConstituenciesWithElectionData({
        selectClause: `
          id,
          state_id,
          eci_id,
          tool_name,
          states(name),
          assigned_ra_id
        `,
        buildConstituencyQuery: (query) => query
          .eq('assigned_ra_id', currentUser.id)
          .order('states(name)', { ascending: true })
          .order('tool_name', { ascending: true, nullsFirst: false }),
      });
    },
    enabled: !!currentUser?.id,
    staleTime: 30000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30000,
    refetchOnMount: 'always',
  });

  const trackedConstituencyIds = useMemo(() => {
    return new Set((assignments || []).map((row) => row.id));
  }, [assignments]);

  useEffect(() => {
    trackedConstituencyIdsRef.current = trackedConstituencyIds;
  }, [trackedConstituencyIds]);

  // Fetch the RA's manager (TL)
  const { data: tlInfo, isLoading: tlLoading } = useQuery({
    queryKey: ['ra-tl', currentUser?.id],
    queryFn: async () => {
      try {
        // First, get current user's manager_id
        const { data: userData, error: userError } = await supabase
          .from('user_roles')
          .select('manager_id')
          .eq('id', currentUser.id)
          .single();
        
        if (userError) {
          return null;
        }
        
        const managerId = userData?.manager_id;
        if (!managerId) {
          return null;
        }
        // Fetch manager details from user_roles
        const { data: tlDataArray, error: tlError } = await supabase
          .from('user_roles')
          .select('id, name, email')
          .eq('id', managerId);
        
        if (tlError) {
          return null;
        }

        const tlData = tlDataArray?.[0];
        if (!tlData) {
          return null;
        }

        return {
          id: tlData.id,
          email: tlData.email || 'N/A',
          name: tlData.name || 'N/A'
        };
      } catch (err) {
        return null;
      }
    },
    enabled: !!currentUser?.id,
    staleTime: -1,
    retry: 3,
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
        const constituencyId = payload?.new?.constituency_id || payload?.old?.constituency_id;
        if (!constituencyId || !trackedConstituencyIdsRef.current.has(constituencyId)) {
          return;
        }
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
    const q = (deferredSearch || '').trim().toLowerCase();
    let rows = assignments.map((assignment) => {
      const candidate = pickLatestElectionRow(assignment.election_data) || assignment.election_data?.[0] || {};
      const cached = electionCacheRef.current.get(assignment.id) || {};
      const election = {
        ...cached,
        ...Object.fromEntries(
          Object.entries(candidate).filter(([, value]) => value !== null && value !== undefined),
        ),
      };
      if (assignment.election_data?.length && assignment.election_data?.length > 1) {
        console.debug('[RADashboard] election_data rows', {
          constituencyId: assignment.id,
          count: assignment.election_data.length,
          candidate,
        });
      }
      if (!election?.eci_round_updated_at && !election?.tool_round_updated_at && !election?.eci_updated_at) {
        console.debug('[RADashboard] missing update timestamps', {
          constituencyId: assignment.id,
          election,
          cached,
          candidate,
        });
      }
      if (Object.keys(election).length > 0) {
        electionCacheRef.current.set(assignment.id, election);
      }
      const constituencyName = getConstituencyName(assignment);
      const lagSeconds = getLagSeconds(election.eci_updated_at, now);
      const activity = getActivityFlags(election.eci_round_updated_at, election.tool_round_updated_at, now);
      if (activity.status === 'Inactive') {
        console.debug('[RADashboard] inactive activity', {
          constituencyId: assignment.id,
          eciRound: election.eci_round,
          toolRound: election.tool_round,
          eciRoundUpdatedAt: election.eci_round_updated_at,
          toolRoundUpdatedAt: election.tool_round_updated_at,
          eciUpdatedAt: election.eci_updated_at,
          now,
        });
      }
      const syncStatus = getSyncStatus(election.eci_round ?? 0, election.tool_round ?? 0);

      return {
        ...assignment,
        constituencyName,
        lagSeconds,
        lagBucket: getLagBucket(lagSeconds),
        hasEciUpdate: Boolean(election.eci_updated_at),
        syncStatus,
        roundDifference: getSyncStatusDelta(election.eci_round ?? 0, election.tool_round ?? 0),
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

    if (filterState !== 'All') {
      rows = rows.filter((assignment) => assignment.states?.name === filterState);
    }

    if (filterSyncStatus !== 'All') {
      rows = rows.filter((assignment) => assignment.syncStatus === filterSyncStatus);
    }

    rows.sort((left, right) => {
      if (sortBy === 'lag-desc') {
        return ((right.lagSeconds ?? -1) - (left.lagSeconds ?? -1)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      if (sortBy === 'lag-asc') {
        return ((left.lagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.lagSeconds ?? Number.MAX_SAFE_INTEGER)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      if (sortBy === 'round-diff') {
        return compareRoundDifference(left.roundDifference, right.roundDifference) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      return compareConstituencyNames(left.constituencyName, right.constituencyName);
    });

    return rows;
  }, [assignments, deferredSearch, filterState, filterSyncStatus, now, sortBy]);

  const uniqueStates = useMemo(() => {
    return [...new Set((assignments || []).map((row) => row.states?.name).filter(Boolean))].sort();
  }, [assignments]);

  if (!authReady) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', bgcolor: '#f0f4f8' }}>
        <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Restoring your session...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={dashboardShellSx} className="dashboard-fade-in">
      {/* Top Navigation Header */}
      <Box sx={{ 
        ...dashboardHeaderSx,
        px: 4,
        py: 2.5,
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
      <Box sx={dashboardContentSx}>
        {/* Page Title */}
        <Box sx={dashboardIntroSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75' }}>
              My Assigned Territories
            </Typography>
            <Box sx={liveBadgeSx}>
              <span className="dashboard-live-dot" />
              Live Updates Active
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
            Monitor your assigned constituencies in real-time
          </Typography>
        </Box>

        {/* Main Table Card */}
        <Box sx={{ ...dashboardTableCardSx, height: 'calc(100% - 60px)', maxWidth: '100%' }}>
          <Box sx={{
            p: 2,
            bgcolor: 'rgba(248, 250, 252, 0.92)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1.25,
            flexWrap: 'wrap'
          }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f4c75' }}>
              Your Assigned Territories ({assignments?.length || 0})
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                label="Search Constituency or State"
                variant="outlined"
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={dashboardSearchSx}
              />
              <FormControl size="small" sx={dashboardControlSx}>
                <InputLabel>State</InputLabel>
                <Select value={filterState} label="State" onChange={(event) => setFilterState(event.target.value)} sx={dashboardControlSx}>
                  <MenuItem value="All">All States</MenuItem>
                  {uniqueStates.map((state) => (
                    <MenuItem key={state} value={state}>{state}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={dashboardControlSx}>
                <InputLabel>Sync Status</InputLabel>
                <Select value={filterSyncStatus} label="Sync Status" onChange={(event) => setFilterSyncStatus(event.target.value)} sx={dashboardControlSx}>
                  <MenuItem value="All">All Sync Status</MenuItem>
                  <MenuItem value="ECI = TOOL">ECI = TOOL</MenuItem>
                  <MenuItem value="ECI > TOOL">ECI &gt; TOOL</MenuItem>
                  <MenuItem value="ECI < TOOL">ECI &lt; TOOL</MenuItem>
                  <MenuItem value="Not Started">Not Started</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={dashboardControlSx}>
                <InputLabel>Sort</InputLabel>
                <Select value={sortBy} label="Sort" onChange={(event) => setSortBy(event.target.value)} sx={dashboardControlSx}>
                  <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
                  <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
                  <MenuItem value="round-diff">Round Difference</MenuItem>
                </Select>
              </FormControl>
              <Box sx={liveBadgeSx}>
                <InfoIcon sx={{ fontSize: '1rem' }} />
                {getSortLabel(sortBy)}
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
            <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={dashboardTableHeadCellSx}>
                      State
                    </TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>
                      Constituency
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
                      ECI Round
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
                      Tool Round
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
                      Sync Status
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
                      ECI / Tool
                      Activity
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
                      ECI Last Updated
                    </TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>
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
                        sx={dashboardTableRowSx}
                      >
                        <TableCell sx={{ py: 1, color: '#64748b' }}>
                          {row.states?.name}
                        </TableCell>
                        <TableCell sx={{ py: 1, fontWeight: 600, color: '#0f4c75' }}>
                          {row.constituencyName}
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                            <Chip
                              label={data.eci_round ?? '--'}
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
                              label={data.tool_round ?? '--'}
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
                            ...getSyncStatusPalette(row.syncStatus)
                          }}>
                            {row.syncStatus}
                            {row.syncStatus !== 'Not Started' && (
                              <Box sx={{ ml: 0.8, display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                                <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'currentColor', opacity: 0.6 }} />
                                <span>{row.roundDifference}</span>
                              </Box>
                            )}
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
                              ...getLagPalette(row.lagSeconds),
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

    </Box>
  );
}
