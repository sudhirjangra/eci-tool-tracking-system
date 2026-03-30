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
  Card,
  CardHeader,
  CardContent,
  TextField,
  InputAdornment,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  FiberManualRecord as ActiveIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

export default function AdminLiveMonitor() {
  const navigate = useNavigate();
  // Get current user
  const [currentUser, setCurrentUser] = useState(null);
  const [managerEmail, setManagerEmail] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
      if (!data.user) navigate('/login');
    });
  }, [navigate]);

  // Fetch reporting person (manager) email
  useEffect(() => {
    const fetchManager = async () => {
      if (!currentUser?.id) return;
      // Get manager_id from user_roles
      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles')
        .select('manager_id')
        .eq('id', currentUser.id)
        .single();
      if (roleErr || !roleData?.manager_id) {
        setManagerEmail(null);
        return;
      }
      // Get manager email from users
      const { data: mgrUser, error: mgrErr } = await supabase
        .from('user_roles')
        .select('id')
        .eq('id', roleData.manager_id)
        .single();
      if (mgrErr || !mgrUser?.id) {
        setManagerEmail('Unknown');
        return;
      }
      // Get email from get_all_user_emails
      const { data: allUsers } = await supabase.rpc('get_all_user_emails');
      const found = allUsers?.find(u => u.id === roleData.manager_id);
      setManagerEmail(found?.email || 'Unknown');
    };
    fetchManager();
  }, [currentUser]);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [filterState, setFilterState] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSyncStatus, setFilterSyncStatus] = useState('All');
  const [filterLagBucket, setFilterLagBucket] = useState('All');
  const [filterAssignment, setFilterAssignment] = useState('All');
  const [sortBy, setSortBy] = useState('lag-desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // 1. Fetch Election Data
  const { data: rawData, isLoading: loadingData } = useQuery({
    queryKey: ['admin-live-feed'],
    queryFn: async () => {
      const { data: constData, error: constErr } = await supabase
        .from('constituencies')
        .select(`
          id,
          state_id,
          eci_id,
          tool_name,
          states(name),
          assigned_tl_id,
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
        .order('states(name)', { ascending: true })
        .order('tool_name', { ascending: true, nullsFirst: false });

      if (constErr) throw constErr;
      return constData || [];
    },
    staleTime: 30000, // Refetch every 30 seconds as fallback
    gcTime: 60 * 60 * 1000,
    refetchInterval: 60000, // Actively refetch every 60 seconds
  });

  // 2. Fetch All User Names and Emails for Translation
  const { data: userEmails } = useQuery({
    queryKey: ['all-user-emails'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, email, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Create a quick lookup dictionary for emails and names
  const emailMap = useMemo(() => {
    const map = {};
    userEmails?.forEach(u => { map[u.id] = { email: u.email, name: u.name }; });
    return map;
  }, [userEmails]);

  // 3. WebSockets for Live Updates
  useEffect(() => {
    const scheduler = createBufferedQueryPatchScheduler(
      queryClient,
      ['admin-live-feed'],
      patchNestedElectionRows,
    );

    // Create unique channel name with timestamp to avoid conflicts
    const channelName = `admin-live-election-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'election_data' }, (payload) => {
        scheduler.push(payload);
      })
      .subscribe((status, err) => {
        if (err) {
          console.warn(`[AdminLiveMonitor] Real-time subscription error: ${err.message}`);
        } else if (status === 'SUBSCRIBED') {
          console.log(`[AdminLiveMonitor] Real-time subscription active: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[AdminLiveMonitor] Channel error: ${channelName}`);
        }
      });

    return () => {
      scheduler.dispose();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 4. Local timer for relative lag and activity display.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000 * 30); // 30 seconds
    return () => clearInterval(timer);
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
  }, [filterState, filterStatus, filterSyncStatus, filterLagBucket, filterAssignment, searchTerm, sortBy]);

  // 5. Process Data & Statuses
  const processedData = useMemo(() => {
    if (!rawData) return [];
    return rawData.map(row => {
      const data = row.election_data?.[0];
      const eciRound = data?.eci_round || 0;
      const toolRound = data?.tool_round || 0;
      const activity = getActivityFlags(data?.eci_round_updated_at, data?.tool_round_updated_at, now);
      const eciLagSeconds = getLagSeconds(data?.eci_updated_at, now);

      const tlEmail = emailMap[row.assigned_tl_id]?.email || 'Unassigned';
      const tlName = emailMap[row.assigned_tl_id]?.name || 'Unassigned';
      const raEmail = emailMap[row.assigned_ra_id]?.email || 'Unassigned';
      const raName = emailMap[row.assigned_ra_id]?.name || 'Unassigned';

      return {
        ...row,
        constituencyName: getConstituencyName(row),
        eciRound,
        toolRound,
        eciActive: activity.eciActive,
        toolActive: activity.toolActive,
        status: activity.status,
        tlEmail,
        tlName,
        raEmail,
        raName,
        syncStatus: getSyncStatus(eciRound, toolRound),
        eciLagSeconds,
        lagBucket: getLagBucket(eciLagSeconds),
        eciLastUpdatedAt: data?.eci_updated_at || null,
        hasEciUpdate: Boolean(data?.eci_updated_at),
      };
    });
  }, [rawData, now, emailMap]);

  // 6. Apply Filters
  const filteredData = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const rows = processedData.filter((row) => {
      const matchesSearch =
        row.constituencyName.toLowerCase().includes(query) ||
        (row.states?.name || '').toLowerCase().includes(query) ||
        String(row.eci_id || '').includes(query);
      
      const matchesState = filterState === 'All' || row.states?.name === filterState;
      const matchesStatus = filterStatus === 'All' || row.status === filterStatus;
      const matchesSyncStatus = filterSyncStatus === 'All' || row.syncStatus === filterSyncStatus;
      const matchesLagBucket = filterLagBucket === 'All' || row.lagBucket === filterLagBucket;
      const matchesAssignment = 
        filterAssignment === 'All' ||
        (filterAssignment === 'Assigned' && (row.assigned_tl_id || row.assigned_ra_id)) ||
        (filterAssignment === 'Unassigned' && (!row.assigned_tl_id && !row.assigned_ra_id));

      return matchesSearch && matchesState && matchesStatus && matchesSyncStatus && matchesLagBucket && matchesAssignment;
    });

    rows.sort((left, right) => {
      if (sortBy === 'updated-desc') {
        return getSortTimestamp(right.eciLastUpdatedAt) - getSortTimestamp(left.eciLastUpdatedAt);
      }

      if (sortBy === 'updated-asc') {
        return getSortTimestamp(left.eciLastUpdatedAt) - getSortTimestamp(right.eciLastUpdatedAt);
      }

      if (sortBy === 'name') {
        return left.constituencyName.localeCompare(right.constituencyName);
      }

      if (sortBy === 'status') {
        return left.status.localeCompare(right.status);
      }

      if (sortBy === 'lag-asc') {
        return (left.eciLagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.eciLagSeconds ?? Number.MAX_SAFE_INTEGER);
      }

      return (right.eciLagSeconds ?? -1) - (left.eciLagSeconds ?? -1);
    });

    return rows;
  }, [filterState, filterStatus, filterSyncStatus, filterLagBucket, filterAssignment, processedData, searchTerm, sortBy]);

  const uniqueStates = [...new Set(rawData?.map(r => r.states?.name).filter(Boolean))];
  
  // Pagination for table
  const paginatedData = useMemo(() => {
    return filteredData.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [filteredData, page, rowsPerPage]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getLagPalette = (seconds) => {
    if (seconds === null || seconds === undefined) return { bgcolor: '#e2e8f0', color: '#64748b' };
    if (seconds <= 60) return { bgcolor: '#d1fae5', color: '#047857' };
    if (seconds <= 300) return { bgcolor: '#fef3c7', color: '#92400e' };
    return { bgcolor: '#fee2e2', color: '#991b1b' };
  };

  const getSyncChipStyles = (syncStatus) => {
    if (syncStatus === 'In Sync') return { backgroundColor: '#d1fae5', color: '#059669' };
    if (syncStatus === 'Not Started') return { backgroundColor: '#e2e8f0', color: '#64748b' };
    if (syncStatus.startsWith('ECI +')) return { backgroundColor: '#fee2e2', color: '#991b1b' };
    return { backgroundColor: '#fef3c7', color: '#92400e' };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', bgcolor: '#f0f4f8', margin: 0, padding: 0 }}>
      {/* Middle Section - Filters */}
      <Box sx={{ p: 0.5, px: 1, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 1.25, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search constituency, state, or ECI ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
          }}
          sx={{
            minWidth: 250,
            '& .MuiOutlinedInput-root': {
              bgcolor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              '&:hover': { borderColor: '#cbd5e1' },
              '&.Mui-focused': { borderColor: '#0f4c75' }
            }
          }}
          size="small"
        />
        
        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel>State</InputLabel>
          <Select
            value={filterState}
            label="State"
            onChange={(e) => setFilterState(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px',
              '& .MuiOutlinedInput-root': { border: '1px solid #e2e8f0' }
            }}
          >
            <MenuItem value="All">All States</MenuItem>
            {uniqueStates.map(state => (
              <MenuItem key={state} value={state}>{state}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => setFilterStatus(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Statuses</MenuItem>
            <MenuItem value="Active">Active (&le;100s)</MenuItem>
            <MenuItem value="Inactive">Inactive (&gt;100s)</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel>Sync Status</InputLabel>
          <Select
            value={filterSyncStatus}
            label="Sync Status"
            onChange={(e) => setFilterSyncStatus(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Sync Status</MenuItem>
            <MenuItem value="In Sync">In Sync ✓</MenuItem>
            <MenuItem value="Not Started">Not Started</MenuItem>
            <MenuItem value="ECI +1">ECI Ahead</MenuItem>
            <MenuItem value="Tool +1">Tool Ahead</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 140 }} size="small">
          <InputLabel>ECI Lag</InputLabel>
          <Select
            value={filterLagBucket}
            label="ECI Lag"
            onChange={(e) => setFilterLagBucket(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Lag</MenuItem>
            <MenuItem value="Fresh">&lt;1 min (Fresh)</MenuItem>
            <MenuItem value="Aging">1-5 min (Aging)</MenuItem>
            <MenuItem value="Stale">&gt;5 min (Stale)</MenuItem>
            <MenuItem value="Unknown">No Data</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 140 }} size="small">
          <InputLabel>Assignment</InputLabel>
          <Select
            value={filterAssignment}
            label="Assignment"
            onChange={(e) => setFilterAssignment(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Assignments</MenuItem>
            <MenuItem value="Assigned">Assigned ✓</MenuItem>
            <MenuItem value="Unassigned">Unassigned ⚠</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 180 }} size="small">
          <InputLabel>Sort</InputLabel>
          <Select
            value={sortBy}
            label="Sort"
            onChange={(e) => setSortBy(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
            <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
            <MenuItem value="updated-desc">Latest ECI Update</MenuItem>
            <MenuItem value="updated-asc">Oldest ECI Update</MenuItem>
            <MenuItem value="name">Constituency Name</MenuItem>
            <MenuItem value="status">Status</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Main Table Area */}
      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#f0f4f8' }}>
        <Box sx={{ m: 0.5, mx: 1, my: 0.5, bgcolor: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: 'calc(100% - 0.5rem)' }}>
          {loadingData ? (
            <Box sx={{ p: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1 }}>
              <CircularProgress size={50} />
              <Typography sx={{ color: '#64748b', fontWeight: 600 }}>
                Establishing secure live feed...
              </Typography>
            </Box>
          ) : filteredData.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center', color: '#94a3b8', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ fontSize: '3rem', mb: 2 }}>🔍</Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>No data matches your filters</Typography>
              <Typography variant="body2">Try adjusting your search criteria or filters</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Activity</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Constituency</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>State</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>ECI Round</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Tool Round</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Sync Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>ECI Last Updated</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>ECI Lag</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Team Lead</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Research Analyst</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((row) => (
                    <TableRow key={row.id} sx={{ '&:hover': { bgcolor: '#f8fafc' }, transition: 'all 0.2s ease', borderBottom: '1px solid #e2e8f0' }}>
                      <TableCell sx={{ py: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.eciActive ? '#10b981' : '#ef4444' }} />
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>ECI</Typography>
                          </Stack>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.toolActive ? '#10b981' : '#ef4444' }} />
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }}>TOOL</Typography>
                          </Stack>
                        </Stack>
                        <Box sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.75,
                          px: 1.2,
                          py: 0.6,
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          backgroundColor: row.status === 'Active' ? '#d1fae5' : '#fee2e2',
                          color: row.status === 'Active' ? '#059669' : '#991b1b',
                          border: row.status === 'Active' ? '1px solid #6ee7b7' : '1px solid #fecaca'
                        }}>
                          {row.status}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f4c75', fontSize: '0.9rem' }}>
                          {row.constituencyName}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.88rem' }}>
                          {row.states?.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <Chip
                            label={row.eciRound}
                            size="small"
                            variant="filled"
                            sx={{
                              bgcolor: '#e0e7ff',
                              color: '#4f46e5',
                              fontWeight: 700
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <Chip
                            label={row.toolRound}
                            size="small"
                            variant="filled"
                            sx={{
                              bgcolor: '#fce7f3',
                              color: '#be185d',
                              fontWeight: 700
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.6,
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          ...getSyncChipStyles(row.syncStatus)
                        }}>
                          {row.syncStatus}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#334155', fontSize: '0.82rem' }}>
                          {formatTimestamp(row.eciLastUpdatedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Chip
                          label={formatLag(row.eciLagSeconds)}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            ...getLagPalette(row.eciLagSeconds),
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        {row.tlEmail === 'Unassigned' ? (
                          <Chip label="—" size="small" variant="outlined" />
                        ) : (
                          <Typography variant="body2" sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                            {row.tlName !== 'Unassigned' ? `${row.tlName} - ${row.tlEmail}` : row.tlEmail}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        {row.raEmail === 'Unassigned' ? (
                          <Chip label="—" size="small" variant="outlined" />
                        ) : (
                          <Typography variant="body2" sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                            {row.raName !== 'Unassigned' ? `${row.raName} - ${row.raEmail}` : row.raEmail}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          
          {/* Pagination */}
          {!loadingData && filteredData.length > 0 && (
            <TablePagination
              rowsPerPageOptions={[50, 100, 250]}
              component="div"
              count={filteredData.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{ borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
