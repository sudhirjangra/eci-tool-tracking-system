import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  pickLatestElectionRow,
} from '../../lib/electionMetrics';
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
  Dialog,
  Collapse,
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
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';

export default function TLDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ra-status');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRAForMap, setSelectedRAForMap] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchRA, setSearchRA] = useState('');
  const [filterRA, setFilterRA] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [mapSearch, setMapSearch] = useState('');
  const [mapState, setMapState] = useState('');
  const [mapRA, setMapRA] = useState('All');
  const [mapStatus, setMapStatus] = useState('All');
  const [mapSyncStatus, setMapSyncStatus] = useState('All');
  const [mapLag, setMapLag] = useState('');
  const [mapUpdate, setMapUpdate] = useState('');
  const [mapSortBy, setMapSortBy] = useState('name');
  const [now, setNow] = useState(Date.now());
  const trackedConstituencyIdsRef = useRef(new Set());
  const electionCacheRef = useRef(new Map());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Get current user session on load
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
      if (!data.user) navigate('/login');
    });
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
        .eq('assigned_tl_id', currentUser.id)
        .order('states(name)', { ascending: true })
        .order('tool_name', { ascending: true, nullsFirst: false })
        .order('eci_round_updated_at', { foreignTable: 'election_data', ascending: false, nullsFirst: false })
        .limit(1, { foreignTable: 'election_data' });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser?.id,
    staleTime: 30000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30000,
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
      const { data, error } = await supabase.rpc('get_my_ras_with_emails');
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
          console.warn(`[TLDashboard] Real-time subscription error: ${err.message}`);
        } else if (status === 'SUBSCRIBED') {
          console.log(`[TLDashboard] Real-time subscription active: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[TLDashboard] Channel error: ${channelName}`);
        }
      });

    return () => {
      scheduler.dispose();
      supabase.removeChannel(channel);
    };
  }, [queryClient, currentUser?.id]);

  const stateOptions = useMemo(() => {
    return [...new Set((myConstituencies || []).map((item) => item.states?.name).filter(Boolean))].sort();
  }, [myConstituencies]);

  const filteredMyConstituencies = useMemo(() => {
    const query = mapSearch.trim().toLowerCase();
    const rows = (myConstituencies || []).map((constituency) => {
      const candidate = pickLatestElectionRow(constituency.election_data) || constituency.election_data?.[0] || {};
      const cached = electionCacheRef.current.get(constituency.id) || {};
      const election = {
        ...cached,
        ...Object.fromEntries(
          Object.entries(candidate).filter(([, value]) => value !== null && value !== undefined),
        ),
      };
      if (Object.keys(election).length > 0) {
        electionCacheRef.current.set(constituency.id, election);
      }
      const lagSeconds = getLagSeconds(election.eci_updated_at, now);
      const activity = getActivityFlags(election.eci_round_updated_at, election.tool_round_updated_at, now);
      const syncStatus = getSyncStatus(election.eci_round ?? 0, election.tool_round ?? 0);

      return {
        ...constituency,
        constituencyName: getConstituencyName(constituency),
        election,
        lagSeconds,
        lagBucket: getLagBucket(lagSeconds),
        hasEciUpdate: Boolean(election.eci_updated_at),
        updateSort: getSortTimestamp(election.eci_updated_at),
        eciActive: activity.eciActive,
        toolActive: activity.toolActive,
        status: activity.status,
        syncStatus,
      };
    }).filter((row) => {
      const matchesSearch =
        !query ||
        row.constituencyName.toLowerCase().includes(query) ||
        (row.states?.name || '').toLowerCase().includes(query) ||
        String(row.eci_id || '').includes(query);
      const matchesState = !mapState || row.states?.name === mapState;
      const matchesRA =
        mapRA === 'All' ||
        (mapRA === 'Unassigned' && !row.assigned_ra_id) ||
        row.assigned_ra_id === mapRA;
      const matchesStatus = mapStatus === 'All' || row.status === mapStatus;
      const matchesSyncStatus =
        mapSyncStatus === 'All' ||
        (mapSyncStatus === 'ECI Ahead' && row.syncStatus.startsWith('ECI +')) ||
        (mapSyncStatus === 'Tool Ahead' && row.syncStatus.startsWith('Tool +')) ||
        row.syncStatus === mapSyncStatus;
      const matchesLag = !mapLag || row.lagBucket === mapLag;
      const matchesUpdate = !mapUpdate || (mapUpdate === 'has-update' ? row.hasEciUpdate : !row.hasEciUpdate);

      return matchesSearch && matchesState && matchesRA && matchesStatus && matchesSyncStatus && matchesLag && matchesUpdate;
    });

    rows.sort((left, right) => {
      if (mapSortBy === 'updated-desc') {
        return right.updateSort - left.updateSort;
      }

      if (mapSortBy === 'updated-asc') {
        return left.updateSort - right.updateSort;
      }

      if (mapSortBy === 'lag-desc') {
        return (right.lagSeconds ?? -1) - (left.lagSeconds ?? -1);
      }

      if (mapSortBy === 'lag-asc') {
        return (left.lagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.lagSeconds ?? Number.MAX_SAFE_INTEGER);
      }

      return left.constituencyName.localeCompare(right.constituencyName);
    });

    return rows;
  }, [mapLag, mapRA, mapSearch, mapSortBy, mapState, mapStatus, mapSyncStatus, mapUpdate, myConstituencies, now]);

  const raOptions = useMemo(() => {
    return (myRAs || []).map((ra) => ({
      id: ra.id,
      label: ra.name ? `${ra.name} - ${ra.email}` : ra.email,
    }));
  }, [myRAs]);

  // Filter and search logic for RA Performance
  const raStatusRows = useMemo(() => {
    if (!myRAs || !myConstituencies) return [];

    let rows = myRAs
      .filter(ra => {
        const matchName = ra.name?.toLowerCase().includes(searchRA.toLowerCase()) || ra.email?.toLowerCase().includes(searchRA.toLowerCase());
        if (searchRA && !matchName) return false;
        if (filterRA) {
          return ra.id === filterRA;
        }
        return true;
      })
      .map((ra) => {
        const assigned = (myConstituencies || []).filter((c) => c.assigned_ra_id === ra.id);
        const territories = assigned.map((c) => {
          const candidate = pickLatestElectionRow(c.election_data) || c.election_data?.[0] || {};
          const cached = electionCacheRef.current.get(c.id) || {};
          const data = {
            ...cached,
            ...Object.fromEntries(
              Object.entries(candidate).filter(([, value]) => value !== null && value !== undefined),
            ),
          };
          if (Object.keys(data).length > 0) {
            electionCacheRef.current.set(c.id, data);
          }
          const activity = getActivityFlags(data.eci_round_updated_at, data.tool_round_updated_at, now);
          const lagSeconds = getLagSeconds(data.eci_updated_at, now);

          return {
            id: c.id,
            eci_id: c.eci_id,
            state: c.states?.name || 'Unknown',
            constituencyName: getConstituencyName(c),
            eci_round: data.eci_round ?? null,
            tool_round: data.tool_round ?? null,
            eciActive: activity.eciActive,
            toolActive: activity.toolActive,
            eciUpdatedAt: data.eci_updated_at || null,
            hasEciUpdate: Boolean(data.eci_updated_at),
            eciLagSeconds: lagSeconds,
            lagBucket: getLagBucket(lagSeconds),
            status: activity.status,
            syncStatus: getSyncStatus(data.eci_round ?? 0, data.tool_round ?? 0),
          };
        });

        // Calculate RA-level statistics
        const activeCount = territories.filter(t => t.status === 'Active').length;
        const inactiveCount = territories.filter(t => t.status === 'Inactive').length;
        const eciActiveCount = territories.filter(t => t.eciActive).length;
        const toolActiveCount = territories.filter(t => t.toolActive).length;
        const raStatus = territories.length === 0 ? 'No Data' : 
                        activeCount === territories.length ? 'Active' :
                        inactiveCount === territories.length ? 'Inactive' : 'Mixed';

        const lastUpdatedAt = territories
          .map((territory) => getSortTimestamp(territory.eciUpdatedAt))
          .filter(Boolean);
        const latestUpdate = lastUpdatedAt.length ? new Date(Math.max(...lastUpdatedAt)).toLocaleString() : '-';
        const latestUpdateTime = lastUpdatedAt.length ? Math.max(...lastUpdatedAt) : 0;
        const worstLagSeconds = territories.reduce((largest, territory) => Math.max(largest, territory.eciLagSeconds ?? -1), -1);

        return {
          ...ra,
          assignedCount: assigned.length,
          territories,
          raStatus,
          activeCount,
          inactiveCount,
          eciActiveCount,
          toolActiveCount,
          latestUpdate,
          latestUpdateTime,
          worstLagSeconds,
        };
      });

  // Apply status filter
    if (filterStatus) {
      rows = rows.filter(ra => ra.raStatus === filterStatus);
    }

    // Apply sorting
    if (sortBy === 'name') {
      rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    } else if (sortBy === 'assigned') {
      rows.sort((a, b) => b.assignedCount - a.assignedCount);
    } else if (sortBy === 'status') {
      const statusOrder = { 'Active': 0, 'Mixed': 1, 'Inactive': 2, 'No Data': 3 };
      rows.sort((a, b) => statusOrder[a.raStatus] - statusOrder[b.raStatus]);
    } else if (sortBy === 'updated-desc') {
      rows.sort((a, b) => b.latestUpdateTime - a.latestUpdateTime);
    } else if (sortBy === 'updated-asc') {
      rows.sort((a, b) => a.latestUpdateTime - b.latestUpdateTime);
    } else if (sortBy === 'lag-desc') {
      rows.sort((a, b) => (b.worstLagSeconds ?? -1) - (a.worstLagSeconds ?? -1));
    } else if (sortBy === 'lag-asc') {
      rows.sort((a, b) => (a.worstLagSeconds ?? Number.MAX_SAFE_INTEGER) - (b.worstLagSeconds ?? Number.MAX_SAFE_INTEGER));
    }

    return rows;
  }, [myRAs, myConstituencies, searchRA, filterRA, filterStatus, sortBy, now]);

  const getLagPalette = (seconds) => {
    if (seconds === null || seconds === '-' || seconds === undefined) return { bgcolor: '#e2e8f0', color: '#64748b' };
    if (seconds <= 60) return { bgcolor: '#d1fae5', color: '#047857' };
    if (seconds <= 120) return { bgcolor: '#fef3c7', color: '#92400e' };
    return { bgcolor: '#fee2e2', color: '#991b1b' };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return { bgcolor: '#d1fae5', color: '#047857' };
      case 'Inactive': return { bgcolor: '#fee2e2', color: '#991b1b' };
      default: return { bgcolor: '#e2e8f0', color: '#64748b' };
    }
  };

  const getSyncStatusColor = (status) => {
    if (status === 'In Sync') return { bgcolor: '#d1fae5', color: '#047857' };
    if (status === 'Not Started') return { bgcolor: '#e2e8f0', color: '#64748b' };
    if (status.startsWith('ECI +')) return { bgcolor: '#fee2e2', color: '#991b1b' };
    return { bgcolor: '#fef3c7', color: '#92400e' };
  };

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
    await supabase.auth.signOut();
    navigate('/login');
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
            T
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
          onClick={() => setActiveTab('my-map')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'my-map' ? 700 : 600,
            color: activeTab === 'my-map' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'my-map' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          My Territory
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
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5 }}>
        {activeTab === 'my-map' && (
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                My Territory
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                All constituencies assigned to you - Delegate to your research analysts
              </Typography>
            </Box>

            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                label="Search Territory"
                variant="outlined"
                size="small"
                sx={{ minWidth: 220 }}
                value={mapSearch}
                onChange={(event) => setMapSearch(event.target.value)}
              />
              <Select
                displayEmpty
                value={mapState}
                onChange={(event) => setMapState(event.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={(selected) => selected || 'All States'}
              >
                <MenuItem value=""><em>All States</em></MenuItem>
                {stateOptions.map((state) => (
                  <MenuItem key={state} value={state}>{state}</MenuItem>
                ))}
              </Select>
              <Select
                displayEmpty
                value={mapRA}
                onChange={(event) => setMapRA(event.target.value)}
                size="small"
                sx={{ minWidth: 220, background: '#fff' }}
                renderValue={(selected) => {
                  if (selected === 'All') return 'All RAs';
                  if (selected === 'Unassigned') return 'Unassigned';
                  const found = raOptions.find((r) => r.id === selected);
                  return found?.label || 'All RAs';
                }}
              >
                <MenuItem value="All"><em>All RAs</em></MenuItem>
                <MenuItem value="Unassigned"><em>Unassigned</em></MenuItem>
                {raOptions.map((ra) => (
                  <MenuItem key={ra.id} value={ra.id}>{ra.label}</MenuItem>
                ))}
              </Select>
              <Select
                displayEmpty
                value={mapStatus}
                onChange={(event) => setMapStatus(event.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={(selected) => selected || 'Activity'}
              >
                <MenuItem value="All"><em>All Activity</em></MenuItem>
                <MenuItem value="Active">Active (&lt;1 min)</MenuItem>
                <MenuItem value="Inactive">Inactive (&ge;1 min)</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={mapSyncStatus}
                onChange={(event) => setMapSyncStatus(event.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={(selected) => selected || 'Sync Status'}
              >
                <MenuItem value="All"><em>All Sync</em></MenuItem>
                <MenuItem value="In Sync">In Sync ✓</MenuItem>
                <MenuItem value="Not Started">Not Started</MenuItem>
                <MenuItem value="ECI Ahead">ECI Ahead</MenuItem>
                <MenuItem value="Tool Ahead">Tool Ahead</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={mapLag}
                onChange={(event) => setMapLag(event.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={(selected) => selected || 'ECI Lag'}
              >
                <MenuItem value=""><em>All ECI Lag</em></MenuItem>
                <MenuItem value="Fresh">Fresh</MenuItem>
                <MenuItem value="Aging">Aging</MenuItem>
                <MenuItem value="Stale">Stale</MenuItem>
                <MenuItem value="Unknown">Unknown</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={mapUpdate}
                onChange={(event) => setMapUpdate(event.target.value)}
                size="small"
                sx={{ minWidth: 170, background: '#fff' }}
                renderValue={(selected) => {
                  if (!selected) return 'ECI Update';
                  return selected === 'has-update' ? 'Has Update' : 'No Update';
                }}
              >
                <MenuItem value=""><em>All Updates</em></MenuItem>
                <MenuItem value="has-update">Has Update</MenuItem>
                <MenuItem value="no-update">No Update</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={mapSortBy}
                onChange={(event) => setMapSortBy(event.target.value)}
                size="small"
                sx={{ minWidth: 180, background: '#fff' }}
                renderValue={(selected) => {
                  const labels = {
                    name: 'Constituency Name',
                    'updated-desc': 'Latest ECI Update',
                    'updated-asc': 'Oldest ECI Update',
                    'lag-desc': 'Highest ECI Lag',
                    'lag-asc': 'Lowest ECI Lag',
                  };
                  return labels[selected] || 'Constituency Name';
                }}
              >
                <MenuItem value="name">Constituency Name</MenuItem>
                <MenuItem value="updated-desc">Latest ECI Update</MenuItem>
                <MenuItem value="updated-asc">Oldest ECI Update</MenuItem>
                <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
                <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
              </Select>
            </Box>

            {loadingMap ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Loading your territory...</Typography>
              </Box>
            ) : (myConstituencies?.length ?? 0) === 0 ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e2e8f0'
              }}>
                <Box sx={{ fontSize: '3rem', mb: 2 }}>🗺️</Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                  No constituencies assigned
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                  Contact your admin to assign territories to you
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff', borderRadius: '12px' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>State</TableCell>
                      <TableCell>ECI ID</TableCell>
                      <TableCell>Constituency</TableCell>
                      <TableCell align="center">ECI Round</TableCell>
                      <TableCell align="center">Tool Round</TableCell>
                      <TableCell align="center">Sync Status</TableCell>
                      <TableCell align="center">Activity</TableCell>
                      <TableCell align="center">ECI Last Updated</TableCell>
                      <TableCell align="center">ECI Lag</TableCell>
                      <TableCell>Assignment</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMyConstituencies.map((constituency) => {
                      const assignedRAId = constituency.assigned_ra_id;
                      const assignedRA = assignedRAId ? (myRAs || []).find((ra) => ra.id === assignedRAId) : null;
                      const isDelegated = Boolean(assignedRAId);
                      const election = constituency.election;
                      const lagSeconds = constituency.lagSeconds;

                      return (
                        <TableRow key={constituency.id} hover>
                          <TableCell>{constituency.states?.name || 'Unknown'}</TableCell>
                          <TableCell>{constituency.eci_id || '—'}</TableCell>
                          <TableCell>{getConstituencyName(constituency)}</TableCell>
                          <TableCell align="center">
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#4f46e5' }}>{election.eci_round ?? '--'}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#be185d' }}>{election.tool_round ?? '--'}</Typography>
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
                              ...getSyncStatusColor(constituency.syncStatus)
                            }}>
                              {constituency.syncStatus}
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: constituency.eciActive ? '#10b981' : '#ef4444' }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>ECI</Typography>
                              </Box>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: constituency.toolActive ? '#10b981' : '#ef4444' }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>TOOL</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                            {formatTimestamp(election.eci_updated_at)}
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'inline-flex', px: 1.25, py: 0.5, borderRadius: '999px', fontWeight: 700, fontFamily: 'monospace', ...getLagPalette(lagSeconds) }}>
                              {formatLag(lagSeconds)}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {isDelegated ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#047857', fontWeight: 600 }}>
                                <Typography>✓</Typography>
                                <Typography>{assignedRA ? `RA Delegated (${assignedRA.name ? `${assignedRA.name} - ${assignedRA.email}` : assignedRA.email})` : 'RA Delegated'}</Typography>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#b45309', fontWeight: 600 }}>
                                <Typography>⚠</Typography>
                                <Typography>Delegate to an RA</Typography>
                              </Box>
                            )}
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

        {activeTab === 'manage-ras' && (
          <Box>
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
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                RA Performance Dashboard
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                Track assigned constituencies and ECI/Tool round progress for each RA.
              </Typography>
            </Box>

            {/* Filters */}
            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                label="Search RA"
                variant="outlined"
                size="small"
                sx={{ minWidth: 200 }}
                value={searchRA}
                onChange={e => setSearchRA(e.target.value)}
              />
              <Select
                displayEmpty
                value={filterRA}
                onChange={e => setFilterRA(e.target.value)}
                size="small"
                sx={{ minWidth: 150, background: '#fff' }}
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
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={selected => selected || 'Filter by Status'}
              >
                <MenuItem value=""><em>All Status</em></MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
                <MenuItem value="No Data">No Data</MenuItem>
              </Select>
              <Select
                displayEmpty
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                size="small"
                sx={{ minWidth: 160, background: '#fff' }}
                renderValue={selected => {
                  const labels = {
                    'name': 'Sort by Name',
                    'assigned': 'Assigned Count',
                    'status': 'Status',
                    'updated-desc': 'Latest ECI Update',
                    'updated-asc': 'Oldest ECI Update',
                    'lag-desc': 'Highest ECI Lag',
                    'lag-asc': 'Lowest ECI Lag',
                  };
                  return labels[selected] || 'Sort by Name';
                }}
              >
                <MenuItem value="name">Sort by Name</MenuItem>
                <MenuItem value="assigned">Assigned Count</MenuItem>
                <MenuItem value="status">Status</MenuItem>
                <MenuItem value="updated-desc">Latest ECI Update</MenuItem>
                <MenuItem value="updated-asc">Oldest ECI Update</MenuItem>
                <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
                <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
              </Select>
            </Box>

            {loadingMap ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Loading RA status...</Typography>
              </Box>
            ) : raStatusRows?.length === 0 ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569' }}>No RAs found</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>Create an RA to start tracking performance data.</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Research Analyst</TableCell>
                      <TableCell align="center">Assigned Constituencies</TableCell>
                      <TableCell align="center">Performance Status</TableCell>
                      <TableCell align="center">ECI / Tool Health</TableCell>
                      <TableCell align="center">Active / Inactive</TableCell>
                      <TableCell align="center">Latest Update</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {raStatusRows.map((item) => (
                      <React.Fragment key={item.id}>
                        <TableRow hover>
                          <TableCell>{item.name ? `${item.name} - ${item.email}` : item.email}</TableCell>
                          <TableCell align="center">{item.assignedCount}</TableCell>
                          <TableCell align="center">
                            <Box sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 2,
                              py: 1,
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              ...getStatusColor(item.raStatus)
                            }}>
                              {item.raStatus}
                            </Box>
                          </TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.85rem' }}>
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {item.territories.length > 0 && (
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: item.eciActiveCount === item.territories.length ? '#10b981' : '#ef4444' }} />
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>ECI {item.eciActiveCount}/{item.territories.length}</Typography>
                                  </Box>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: item.toolActiveCount === item.territories.length ? '#10b981' : '#ef4444' }} />
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>TOOL {item.toolActiveCount}/{item.territories.length}</Typography>
                                  </Box>
                                </Box>
                              )}
                              {item.activeCount > 0 && (
                                <Box sx={{ px: 1.5, py: 0.5, bg: '#d1fae5', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#047857' }}>
                                  ✓ {item.activeCount}
                                </Box>
                              )}
                              {item.inactiveCount > 0 && (
                                <Box sx={{ px: 1.5, py: 0.5, bg: '#fee2e2', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>
                                  ✕ {item.inactiveCount}
                                </Box>
                              )}
                              {item.territories.length === 0 && (
                                <Box sx={{ px: 1.5, py: 0.5, bg: '#e2e8f0', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                  No Data
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                              <Typography sx={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                                {item.latestUpdate}
                              </Typography>
                              <Box sx={{ display: 'inline-flex', px: 1.25, py: 0.4, borderRadius: '999px', fontWeight: 700, fontFamily: 'monospace', ...getLagPalette(item.worstLagSeconds) }}>
                                {formatLag(item.worstLagSeconds >= 0 ? item.worstLagSeconds : null)}
                              </Box>
                            </Box>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={6} sx={{ p: 0, borderBottom: 'none' }}>
                            <Collapse in={true} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, bgcolor: '#f9fafb' }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Constituency Details</Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow sx={{ backgroundColor: '#eef2ff' }}>
                                      <TableCell>State</TableCell>
                                      <TableCell>ECI ID</TableCell>
                                      <TableCell>Constituency</TableCell>
                                      <TableCell align="center">ECI Round</TableCell>
                                      <TableCell align="center">Tool Round</TableCell>
                                      <TableCell align="center">Sync Status</TableCell>
                                      <TableCell align="center">Activity</TableCell>
                                      <TableCell align="center">ECI Last Updated</TableCell>
                                      <TableCell align="center">ECI Lag</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {item.territories.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={9} align="center">No assigned constituencies</TableCell>
                                      </TableRow>
                                    ) : (
                                      item.territories.map((territory) => (
                                        <TableRow key={territory.id}>
                                          <TableCell>{territory.state}</TableCell>
                                          <TableCell>{territory.eci_id}</TableCell>
                                          <TableCell>{territory.constituencyName}</TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                              <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#4f46e5' }}>{territory.eci_round ?? '--'}</Typography>
                                            </Box>
                                          </TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                              <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#be185d' }}>{territory.tool_round ?? '--'}</Typography>
                                            </Box>
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
                                              ...getSyncStatusColor(territory.syncStatus)
                                            }}>
                                              {territory.syncStatus}
                                            </Box>
                                          </TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: territory.eciActive ? '#10b981' : '#ef4444' }} />
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>ECI</Typography>
                                              </Box>
                                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: territory.toolActive ? '#10b981' : '#ef4444' }} />
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>TOOL</Typography>
                                              </Box>
                                            </Box>
                                          </TableCell>
                                          <TableCell align="center" sx={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#64748b' }}>{formatTimestamp(territory.eciUpdatedAt)}</TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'inline-flex', px: 1.25, py: 0.4, borderRadius: '999px', fontWeight: 700, fontFamily: 'monospace', ...getLagPalette(territory.eciLagSeconds) }}>
                                              {formatLag(territory.eciLagSeconds)}
                                            </Box>
                                          </TableCell>
                                        </TableRow>
                                      ))
                                    )}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Box>

      {/* Modals */}
      <CreateRAModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tlId={currentUser?.id}
        onSuccess={() => {
          setIsModalOpen(false);
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
