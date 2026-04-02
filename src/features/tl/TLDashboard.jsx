import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { fetchConstituenciesWithElectionData } from '../../lib/constituencyData';
import { createBufferedQueryPatchScheduler, patchNestedElectionRows, subscribeToElectionData } from '../../lib/electionRealtime';
import {
  compareConstituencyNames,
  compareRoundDifference,
  getActivityFlags,
  getConstituencyName,
  getLagBucket,
  getLagSeconds,
  getSyncStatus,
  getSyncStatusDelta,
  normalizeText,
  formatLag,
  formatTimestamp,
  getSortTimestamp,
  pickLatestElectionRow,
  toSearchText,
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
  getStatusPalette,
  getSyncStatusPalette,
} from '../../lib/dashboardUi';
import CreateRAModal from './CreateRAModal';
import DelegateMapModal from './DelegateMapModal';
import {
  Box,
  Drawer,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Card,
  CardHeader,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Chip,
  Stack,
  AppBar,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Map as MapIcon,
  Visibility as VisibilityIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
} from '@mui/icons-material';

export default function TLDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ra-status');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRAForMap, setSelectedRAForMap] = useState(null);
  const [selectedRAForEdit, setSelectedRAForEdit] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchRA, setSearchRA] = useState('');
  const deferredSearchRA = useDeferredValue(searchRA);
  const [filterRA, setFilterRA] = useState('');
  const [filterSyncStatus, setFilterSyncStatus] = useState('All');
  const [sortBy, setSortBy] = useState('lag-desc');
  const [mapSearch, setMapSearch] = useState('');
  const deferredMapSearch = useDeferredValue(mapSearch);
  const [mapState, setMapState] = useState('');
  const [mapRA, setMapRA] = useState('All');
  const [mapSyncStatus, setMapSyncStatus] = useState('All');
  const [mapLag, setMapLag] = useState('');
  const [mapSortBy, setMapSortBy] = useState('lag-desc');
  const [now, setNow] = useState(Date.now());
  const [authReady, setAuthReady] = useState(false);
  const trackedConstituencyIdsRef = useRef(new Set());
  const electionCacheRef = useRef(new Map());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Get current user session on load
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
    queryKey: ['tl-user-info', currentUser?.id],
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

  // Fetch the TL's assigned constituencies
  const { data: myConstituencies, isLoading: loadingMap } = useQuery({
    queryKey: ['tl-constituencies', currentUser?.id],
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
          .eq('assigned_tl_id', currentUser.id)
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
    return new Set((myConstituencies || []).map((row) => row.id));
  }, [myConstituencies]);

  useEffect(() => {
    trackedConstituencyIdsRef.current = trackedConstituencyIds;
  }, [trackedConstituencyIds]);

  // Fetch the RAs managed by this TL
  const { data: myRAs, refetch: refetchRAs } = useQuery({
    queryKey: ['tl-ras', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, email, name')
        .eq('role', 'ra')
        .eq('manager_id', currentUser.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser?.id,
  });
  // Real-time subscription for live updates on election_data
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!currentUser?.id) return undefined;

    const scheduler = createBufferedQueryPatchScheduler(
      queryClient,
      ['tl-constituencies', currentUser.id],
      patchNestedElectionRows,
    );

    // Create unique channel name with timestamp and user ID to avoid conflicts
    const channelName = `tl-election-${currentUser.id}-${Date.now()}`;
    const channel = subscribeToElectionData({
      supabase,
      channelName,
      queryClient,
      recoveryQueryKeys: [['tl-constituencies', currentUser.id]],
      logPrefix: 'TLDashboard',
      onPayload: (payload) => {
        const constituencyId = payload?.new?.constituency_id || payload?.old?.constituency_id;
        if (!constituencyId || !trackedConstituencyIdsRef.current.has(constituencyId)) {
          return;
        }
        scheduler.push(payload);
      },
    });

    return () => {
      scheduler.dispose();
      supabase.removeChannel(channel);
    };
  }, [queryClient, currentUser?.id]);

  const stateOptions = useMemo(() => {
    return [...new Set((myConstituencies || []).map((item) => normalizeText(item.states?.name)).filter(Boolean))].sort((left, right) => compareConstituencyNames(left, right));
  }, [myConstituencies]);

  const filteredMyConstituencies = useMemo(() => {
    const query = toSearchText(deferredMapSearch);
    const rows = (myConstituencies || []).map((constituency) => {
      const candidate = pickLatestElectionRow(constituency.election_data) || constituency.election_data?.[0] || {};
      const cached = electionCacheRef.current.get(constituency.id) || {};
      const election = {
        ...cached,
        ...Object.fromEntries(
          Object.entries(candidate).filter(([, value]) => value !== null && value !== undefined),
        ),
      };
      if (constituency.election_data?.length && constituency.election_data?.length > 1) {
        console.debug('[TLDashboard] election_data rows', {
          constituencyId: constituency.id,
          count: constituency.election_data.length,
          candidate,
        });
      }
      if (!election?.eci_round_updated_at && !election?.tool_round_updated_at && !election?.eci_updated_at) {
        console.debug('[TLDashboard] missing update timestamps', {
          constituencyId: constituency.id,
          election,
          cached,
          candidate,
        });
      }
      if (Object.keys(election).length > 0) {
        electionCacheRef.current.set(constituency.id, election);
      }
      const lagSeconds = getLagSeconds(election.eci_updated_at, now);
      const activity = getActivityFlags(election.eci_round_updated_at, election.tool_round_updated_at, now);
      if (activity.status === 'Inactive') {
        console.debug('[TLDashboard] inactive activity', {
          constituencyId: constituency.id,
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
        ...constituency,
        constituencyName: getConstituencyName(constituency),
        election,
        lagSeconds,
        lagBucket: getLagBucket(lagSeconds),
        updateSort: getSortTimestamp(election.eci_updated_at),
        eciActive: activity.eciActive,
        toolActive: activity.toolActive,
        status: activity.status,
        syncStatus,
        syncDelta: getSyncStatusDelta(election.eci_round ?? 0, election.tool_round ?? 0),
      };
    }).filter((row) => {
      const matchesSearch =
        !query ||
        toSearchText(row.constituencyName).includes(query) ||
        toSearchText(row.states?.name).includes(query) ||
        toSearchText(row.eci_id).includes(query);
      const matchesState = !mapState || row.states?.name === mapState;
      const matchesRA =
        mapRA === 'All' ||
        (mapRA === 'Unassigned' && !row.assigned_ra_id) ||
        row.assigned_ra_id === mapRA;
      const matchesSyncStatus = mapSyncStatus === 'All' || row.syncStatus === mapSyncStatus;
      const matchesLag = !mapLag || row.lagBucket === mapLag;

      return matchesSearch && matchesState && matchesRA && matchesSyncStatus && matchesLag;
    });

    rows.sort((left, right) => {
      if (mapSortBy === 'lag-desc') {
        return ((right.lagSeconds ?? -1) - (left.lagSeconds ?? -1)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      if (mapSortBy === 'lag-asc') {
        return ((left.lagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.lagSeconds ?? Number.MAX_SAFE_INTEGER)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      if (mapSortBy === 'round-diff') {
        return compareRoundDifference(left.syncDelta, right.syncDelta) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      return compareConstituencyNames(left.constituencyName, right.constituencyName);
    });

    return rows;
  }, [deferredMapSearch, mapLag, mapRA, mapSortBy, mapState, mapSyncStatus, myConstituencies, now]);

  const raOptions = useMemo(() => {
    return (myRAs || []).map((ra) => ({
      id: ra.id,
      label: ra.name ? `${ra.name} - ${ra.email}` : ra.email,
    }));
  }, [myRAs]);

  const raPerformanceRows = useMemo(() => {
    const query = toSearchText(deferredSearchRA);
    const rows = filteredMyConstituencies.filter((row) => {
      const assignedRA = row.assigned_ra_id ? (myRAs || []).find((ra) => ra.id === row.assigned_ra_id) : null;
      const raLabel = assignedRA ? toSearchText(`${normalizeText(assignedRA.name)} ${normalizeText(assignedRA.email)}`) : 'unassigned';
      const matchesSearch = !query || raLabel.includes(query) || toSearchText(row.constituencyName).includes(query);
      const matchesRA = !filterRA || row.assigned_ra_id === filterRA;
      const matchesSync = filterSyncStatus === 'All' || row.syncStatus === filterSyncStatus;
      return matchesSearch && matchesRA && matchesSync;
    });

    rows.sort((left, right) => {
      if (sortBy === 'lag-asc') {
        return ((left.lagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.lagSeconds ?? Number.MAX_SAFE_INTEGER)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }
      if (sortBy === 'round-diff') {
        return compareRoundDifference(left.syncDelta, right.syncDelta) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }
      return ((right.lagSeconds ?? -1) - (left.lagSeconds ?? -1)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
    });

    return rows;
  }, [deferredSearchRA, filterRA, filterSyncStatus, filteredMyConstituencies, myRAs, sortBy]);

  const handleDeleteRA = async (raId, email, name) => {
    const displayName = name || email;
    const isConfirmed = window.confirm(
      `WARNING: Are you sure you want to remove ${displayName}?\n\nThis will permanently delete their account and return all their assigned territories back to your unassigned pool.`
    );

    if (!isConfirmed) return;

    const { error } = await supabase.rpc('delete_research_analyst', { target_ra_id: raId });

    if (error) {
      alert(`Error deleting RA: ${error.message}`);
    } else {
      refetchRAs();
    }
  };

  const handleLogout = async () => {
    queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate('/login');
  };

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
            // borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            border: '2px solid rgba(255,255,255,0.3)'
          }}>
            <img 
              src="/favicon-96x96.png" 
              alt="Elections 2026" 
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 'bold', lineHeight: 1 }}>Elections 2026</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>TEAM LEAD DASHBOARD</Typography>
          </Box>
        </Box>

        {/* User Info & Logout */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right', pr: 2, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{userInfo?.name || 'Team Lead'}</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>{userInfo?.email || currentUser?.email}</Typography>
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

      {/* Tab Navigation */}
      <Box sx={{
        bgcolor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: 0,
        px: 4
      }}>
        <Button
          onClick={() => setActiveTab('ra-status')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'ra-status' ? 700 : 600,
            color: activeTab === 'ra-status' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'ra-status' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          RA Performance
        </Button>
        <Button
          onClick={() => setActiveTab('manage-ras')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'manage-ras' ? 700 : 600,
            color: activeTab === 'manage-ras' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'manage-ras' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          Manage Research Analysts
        </Button>
      </Box>

      {/* Main Content Area */}
      <Box sx={dashboardContentSx}>
        {activeTab === 'manage-ras' && (
          <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
              <Box>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                  Research Analysts
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Manage your team of research analysts and delegate territories
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={() => setIsModalOpen(true)}
                sx={{
                  background: 'linear-gradient(135deg, #0f4c75 0%, #00a86b 100%)',
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  py: 1.2,
                  px: 2.5,
                  borderRadius: '8px',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(15, 76, 117, 0.3)'
                  }
                }}
              >
                Create Research Analyst
              </Button>
            </Box>

            {myRAs?.length === 0 ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e2e8f0'
              }}>
                <Box sx={{ fontSize: '3rem', mb: 2 }}>👥</Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                  No research analysts yet
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8', mb: 3 }}>
                  Create your first research analyst to start delegating territories
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<PersonAddIcon />}
                  onClick={() => setIsModalOpen(true)}
                  sx={{
                    background: 'linear-gradient(135deg, #0f4c75 0%, #00a86b 100%)',
                    textTransform: 'none'
                  }}
                >
                  Create Research Analyst
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff', borderRadius: '12px' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Research Analyst</TableCell>
                      <TableCell align="center">Assigned Constituencies</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {myRAs.map((ra) => {
                      const assignedCount = (myConstituencies || []).filter((c) => c.assigned_ra_id === ra.id).length;
                      return (
                        <TableRow key={ra.id} hover>
                          <TableCell>{ra.name ? `${ra.name} - ${ra.email}` : ra.email}</TableCell>
                          <TableCell align="center">{assignedCount}</TableCell>
                          <TableCell align="center">
                            <Button
                              variant="outlined"
                              startIcon={<EditIcon fontSize="small" />}
                              onClick={() => setSelectedRAForEdit(ra)}
                              sx={{
                                borderColor: '#cbd5e1',
                                color: '#475569',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                py: 0.5,
                                px: 1.5,
                                mr: 1,
                                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' }
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="contained"
                              startIcon={<EditIcon fontSize="small" />}
                              onClick={() => setSelectedRAForMap(ra)}
                              sx={{
                                background: 'linear-gradient(135deg, #0f4c75 0%, #1a5a8e 100%)',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                py: 0.5,
                                px: 1.5,
                                mr: 1
                              }}
                            >
                              Delegate
                            </Button>
                            <Button
                              variant="outlined"
                              startIcon={<DeleteIcon fontSize="small" />}
                              onClick={() => handleDeleteRA(ra.id, ra.email, ra.name)}
                              sx={{
                                borderColor: '#fecaca',
                                color: '#dc2626',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                py: 0.5,
                                px: 1.5,
                                '&:hover': { borderColor: '#dc2626', bgcolor: 'rgba(220, 38, 38, 0.05)' }
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {activeTab === 'ra-status' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, p: 2, overflow: 'auto' }}>
            {/* <Box sx={dashboardIntroSx}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                RA Performance Dashboard
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                Track assigned constituencies and ECI/Tool round progress for each RA.
              </Typography>
            </Box> */}

            {/* Filters */}
            <Box sx={{ ...dashboardTableCardSx, ...dashboardIntroSx, mb: 2, p: 1.5, flexDirection: 'row', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                label="Search RA or Constituency"
                variant="outlined"
                size="small"
                sx={dashboardSearchSx}
                value={searchRA}
                onChange={e => setSearchRA(e.target.value)}
              />
              <Select
                displayEmpty
                value={filterRA}
                onChange={e => setFilterRA(e.target.value)}
                size="small"
                sx={dashboardControlSx}
                renderValue={selected => {
                  if (!selected) return 'Filter by Assigned RA';
                  const found = raOptions.find((r) => r.id === selected);
                  return found?.label || selected;
                }}
              >
                <MenuItem value=""><em>All Assigned RAs</em></MenuItem>
                {raOptions.map((ra) => (
                  <MenuItem key={ra.id} value={ra.id}>{ra.label}</MenuItem>
                ))}
              </Select>
              <Select
                displayEmpty
                value={filterSyncStatus}
                onChange={e => setFilterSyncStatus(e.target.value)}
                size="small"
                sx={dashboardControlSx}
                renderValue={selected => selected || 'Sync Status'}
              >
                <MenuItem value="All"><em>All Sync Status</em></MenuItem>
                <MenuItem value="ECI = TOOL">ECI = TOOL</MenuItem>
                <MenuItem value="ECI > TOOL">ECI &gt; TOOL</MenuItem>
                <MenuItem value="ECI < TOOL">ECI &lt; TOOL</MenuItem>
                <MenuItem value="Not Started">Not Started</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                size="small"
                sx={dashboardControlSx}
                renderValue={selected => getSortLabel(selected)}
              >
                <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
                <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
                <MenuItem value="round-diff">Round Difference</MenuItem>
              </Select>
            </Box>

            {loadingMap ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Loading RA status...</Typography>
              </Box>
            ) : raPerformanceRows?.length === 0 ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569' }}>No constituencies found</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>Adjust the filters or delegate constituencies to an RA.</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ ...dashboardTableCardSx, flex: 1, minHeight: 0, overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={dashboardTableHeadCellSx}>State</TableCell>
                      <TableCell sx={dashboardTableHeadCellSx}>Constituency</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>ECI Round</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>Tool Round</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>Sync Status</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>Activity</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>ECI Last Updated</TableCell>
                      <TableCell align="center" sx={dashboardTableHeadCellSx}>ECI Lag</TableCell>
                      <TableCell sx={dashboardTableHeadCellSx}>Research Analyst</TableCell>
                    </TableRow>
                    {/* </TableRow> */}
                  </TableHead>
                  <TableBody>
                    {raPerformanceRows.map((item) => {
                      const assignedRA = item.assigned_ra_id ? (myRAs || []).find((ra) => ra.id === item.assigned_ra_id) : null;
                      return (
                        <TableRow key={item.id} sx={dashboardTableRowSx}>
                          <TableCell>{item.states?.name || 'Unknown'}</TableCell>
                          <TableCell>{item.constituencyName}</TableCell>
                          <TableCell align="center">
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#4f46e5' }}>{item.election.eci_round ?? '--'}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#be185d' }}>{item.election.tool_round ?? '--'}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.5,
                              py: 0.5,
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              ...getSyncStatusPalette(item.syncStatus)
                            }}>
                              {item.syncStatus}
                              {item.syncStatus !== 'Not Started' && (
                                <Box sx={{ ml: 0.8, display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                                  <span>|</span>
                                  <span>{item.syncDelta}</span>
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: item.eciActive ? '#10b981' : '#cbd5e1' }} />
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569' }}>ECI</Typography>
                              </Box>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: item.toolActive ? '#10b981' : '#cbd5e1' }} />
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569' }}>TOOL</Typography>
                              </Box>
                              <Box sx={{ px: 1.25, py: 0.4, borderRadius: '999px', ...getStatusPalette(item.status) }}>
                                {item.status}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.85rem', color: '#64748b' }}>{formatTimestamp(item.election.eci_updated_at)}</TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'inline-flex', px: 1.25, py: 0.4, borderRadius: '999px', fontWeight: 700, fontFamily: 'monospace', ...getLagPalette(item.lagSeconds) }}>
                              {formatLag(item.lagSeconds)}
                            </Box>
                          </TableCell>
                          <TableCell>{assignedRA ? (assignedRA.name ? `${assignedRA.name} - ${assignedRA.email}` : assignedRA.email) : 'Unassigned'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Box>

      {/* Modals */}
      <CreateRAModal
        isOpen={isModalOpen || !!selectedRAForEdit}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedRAForEdit(null);
        }}
        tlId={currentUser?.id}
        ra={selectedRAForEdit}
        onSuccess={() => {
          setIsModalOpen(false);
          setSelectedRAForEdit(null);
          refetchRAs();
        }}
      />
      <DelegateMapModal
        isOpen={!!selectedRAForMap}
        onClose={() => setSelectedRAForMap(null)}
        ra={selectedRAForMap}
        tlId={currentUser?.id}
        onSuccess={() => {
          setSelectedRAForMap(null);
        }}
      />
    </Box>
  );
}
