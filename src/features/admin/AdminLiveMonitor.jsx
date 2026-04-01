import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  formatLag,
  formatTimestamp,
  getSortTimestamp,
  pickLatestElectionRow,
} from '../../lib/electionMetrics';
import {
  dashboardControlSx,
  dashboardFilterBarSx,
  dashboardSearchSx,
  dashboardShellSx,
  dashboardTableCardSx,
  dashboardTableHeadCellSx,
  dashboardTableRowSx,
  getLagPalette,
  getStatusPalette,
  getSyncStatusPalette,
} from '../../lib/dashboardUi';
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
  const [authReady, setAuthReady] = useState(false);
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
  const electionCacheRef = useRef(new Map());
  const [filterState, setFilterState] = useState('All');
  const [filterSyncStatus, setFilterSyncStatus] = useState('All');
  const [filterTL, setFilterTL] = useState('All');
  const [filterRA, setFilterRA] = useState('All');
  const [sortBy, setSortBy] = useState('lag-desc');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // 1. Fetch Election Data
  const { data: rawData, isLoading: loadingData } = useQuery({
    queryKey: ['admin-live-feed'],
    queryFn: async () => {
      return fetchConstituenciesWithElectionData({
        selectClause: `
          id,
          state_id,
          eci_id,
          tool_name,
          states(name),
          assigned_tl_id,
          assigned_ra_id
        `,
        buildConstituencyQuery: (query) => query
          .order('states(name)', { ascending: true })
          .order('tool_name', { ascending: true, nullsFirst: false }),
      });
    },
    staleTime: 30000, // Refetch every 30 seconds as fallback
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30000, // Actively refetch every 30 seconds
    refetchOnMount: 'always',
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
    const channel = subscribeToElectionData({
      supabase,
      channelName,
      queryClient,
      recoveryQueryKeys: [['admin-live-feed']],
      logPrefix: 'AdminLiveMonitor',
      onPayload: (payload) => {
        scheduler.push(payload);
      },
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
  }, [filterState, filterSyncStatus, filterTL, filterRA, deferredSearchTerm, sortBy]);

  // 5. Process Data & Statuses
  const processedData = useMemo(() => {
    if (!rawData) return [];
    return rawData.map(row => {
      const candidate = pickLatestElectionRow(row.election_data) || row.election_data?.[0] || {};
      const cached = electionCacheRef.current.get(row.id) || {};
      const data = {
        ...cached,
        ...Object.fromEntries(
          Object.entries(candidate).filter(([, value]) => value !== null && value !== undefined),
        ),
      };
      if (row.election_data?.length && row.election_data?.length > 1) {
        console.debug('[AdminLiveMonitor] election_data rows', {
          constituencyId: row.id,
          count: row.election_data.length,
          candidate,
        });
      }
      if (!data?.eci_round_updated_at && !data?.tool_round_updated_at && !data?.eci_updated_at) {
        console.debug('[AdminLiveMonitor] missing update timestamps', {
          constituencyId: row.id,
          data,
          cached,
          candidate,
        });
      }
      if (Object.keys(data).length > 0) {
        electionCacheRef.current.set(row.id, data);
      }
      const eciRound = data?.eci_round ?? 0;
      const toolRound = data?.tool_round ?? 0;
      const activity = getActivityFlags(data?.eci_round_updated_at, data?.tool_round_updated_at, now);
      if (activity.status === 'Inactive') {
        console.debug('[AdminLiveMonitor] inactive activity', {
          constituencyId: row.id,
          eciRound: data?.eci_round,
          toolRound: data?.tool_round,
          eciRoundUpdatedAt: data?.eci_round_updated_at,
          toolRoundUpdatedAt: data?.tool_round_updated_at,
          eciUpdatedAt: data?.eci_updated_at,
          now,
        });
      }
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
        roundDifference: getSyncStatusDelta(eciRound ?? 0, toolRound ?? 0),
        eciActive: activity.eciActive,
        toolActive: activity.toolActive,
        status: activity.status,
        tlEmail,
        tlName,
        raEmail,
        raName,
        syncStatus: getSyncStatus(eciRound ?? 0, toolRound ?? 0),
        eciLagSeconds,
        lagBucket: getLagBucket(eciLagSeconds),
        eciLastUpdatedAt: data?.eci_updated_at || null,
        hasEciUpdate: Boolean(data?.eci_updated_at),
      };
    });
  }, [rawData, now, emailMap]);

  // 6. Apply Filters
  const filteredData = useMemo(() => {
    const query = (deferredSearchTerm || '').trim().toLowerCase();
    const rows = processedData.filter((row) => {
      const matchesSearch =
        row.constituencyName.toLowerCase().includes(query) ||
        (row.states?.name || '').toLowerCase().includes(query) ||
        String(row.eci_id || '').includes(query) ||
        (row.tlName || '').toLowerCase().includes(query) ||
        (row.raName || '').toLowerCase().includes(query);
      
      const matchesState = filterState === 'All' || row.states?.name === filterState;
      const matchesSyncStatus = filterSyncStatus === 'All' || row.syncStatus === filterSyncStatus;
      const matchesTL = filterTL === 'All' || row.tlEmail === filterTL;
      const matchesRA = filterRA === 'All' || row.raEmail === filterRA;

      return matchesSearch && matchesState && matchesSyncStatus && matchesTL && matchesRA;
    });

    rows.sort((left, right) => {
      if (sortBy === 'round-diff') {
        return compareRoundDifference(left.roundDifference, right.roundDifference) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      if (sortBy === 'lag-asc') {
        return ((left.eciLagSeconds ?? Number.MAX_SAFE_INTEGER) - (right.eciLagSeconds ?? Number.MAX_SAFE_INTEGER)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
      }

      return ((right.eciLagSeconds ?? -1) - (left.eciLagSeconds ?? -1)) || compareConstituencyNames(left.constituencyName, right.constituencyName);
    });

    return rows;
  }, [deferredSearchTerm, filterState, filterSyncStatus, filterTL, filterRA, processedData, sortBy]);

  const uniqueStates = useMemo(() => {
    return [...new Set(rawData?.map(r => r.states?.name).filter(Boolean))];
  }, [rawData]);

  const uniqueTLs = useMemo(() => {
    const options = new Map();
    processedData.forEach((row) => {
      if (row.tlEmail && row.tlEmail !== 'Unassigned') {
        options.set(row.tlEmail, row.tlName && row.tlName !== 'Unassigned' ? `${row.tlName} - ${row.tlEmail}` : row.tlEmail);
      }
    });
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [processedData]);
  const uniqueRAs = useMemo(() => {
    const options = new Map();
    processedData.forEach((row) => {
      if (row.raEmail && row.raEmail !== 'Unassigned') {
        options.set(row.raEmail, row.raName && row.raName !== 'Unassigned' ? `${row.raName} - ${row.raEmail}` : row.raEmail);
      }
    });
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [processedData]);
  
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

  if (!authReady) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '50vh', bgcolor: '#f0f4f8' }}>
        <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Restoring your session...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ ...dashboardShellSx, minHeight: '100%', bgcolor: 'transparent', margin: 0, padding: 0 }} className="dashboard-fade-in">
      {/* Middle Section - Filters */}
      <Box sx={dashboardFilterBarSx}>
        <TextField
          placeholder="Search constituency, state, TL, or RA..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
          }}
          sx={dashboardSearchSx}
          size="small"
        />
        
        <FormControl sx={dashboardControlSx} size="small">
          <InputLabel>State</InputLabel>
          <Select
            value={filterState}
            label="State"
            onChange={(e) => setFilterState(e.target.value)}
            sx={dashboardControlSx}
          >
            <MenuItem value="All">All States</MenuItem>
            {uniqueStates.map(state => (
              <MenuItem key={state} value={state}>{state}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={dashboardControlSx} size="small">
          <InputLabel>Sync Status</InputLabel>
          <Select
            value={filterSyncStatus}
            label="Sync Status"
            onChange={(e) => setFilterSyncStatus(e.target.value)}
            sx={dashboardControlSx}
          >
            <MenuItem value="All">All Sync Status</MenuItem>
            <MenuItem value="ECI = TOOL">ECI = TOOL</MenuItem>
            <MenuItem value="ECI > TOOL">ECI &gt; TOOL</MenuItem>
            <MenuItem value="ECI < TOOL">ECI &lt; TOOL</MenuItem>
            <MenuItem value="Not Started">Not Started</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={dashboardControlSx} size="small">
          <InputLabel>Team Lead</InputLabel>
          <Select
            value={filterTL}
            label="Team Lead"
            onChange={(e) => setFilterTL(e.target.value)}
            sx={dashboardControlSx}
          >
            <MenuItem value="All">All Team Leads</MenuItem>
            {uniqueTLs.map((tl) => (
              <MenuItem key={tl.value} value={tl.value}>{tl.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={dashboardControlSx} size="small">
          <InputLabel>Research Analyst</InputLabel>
          <Select
            value={filterRA}
            label="Research Analyst"
            onChange={(e) => setFilterRA(e.target.value)}
            sx={dashboardControlSx}
          >
            <MenuItem value="All">All Research Analysts</MenuItem>
            {uniqueRAs.map((ra) => (
              <MenuItem key={ra.value} value={ra.value}>{ra.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={dashboardControlSx} size="small">
          <InputLabel>Sort</InputLabel>
          <Select
            value={sortBy}
            label="Sort"
            onChange={(e) => setSortBy(e.target.value)}
            sx={dashboardControlSx}
          >
            <MenuItem value="lag-desc">Highest ECI Lag</MenuItem>
            <MenuItem value="lag-asc">Lowest ECI Lag</MenuItem>
            <MenuItem value="round-diff">Round Difference</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Main Table Area */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', bgcolor: '#f0f4f8' }}>
        <Box sx={{ ...dashboardTableCardSx, m: 0.5, mx: 1, my: 0.5, height: 'calc(100% - 0.5rem)', minHeight: 0 }}>
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
            <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={dashboardTableHeadCellSx}>State</TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>Constituency</TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>ECI Round</TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>Tool Round</TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>Sync Status</TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>Activity</TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>ECI Last Updated</TableCell>
                    <TableCell align="center" sx={dashboardTableHeadCellSx}>ECI Lag</TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>Team Lead</TableCell>
                    <TableCell sx={dashboardTableHeadCellSx}>Research Analyst</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((row) => (
                    <TableRow key={row.id} sx={dashboardTableRowSx}>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.88rem' }}>
                          {row.states?.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f4c75', fontSize: '0.9rem' }}>
                          {row.constituencyName}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <Chip
                            label={row.eciRound ?? '--'}
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
                            label={row.toolRound ?? '--'}
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
                          ...getStatusPalette(row.status)
                        }}>
                          {row.status}
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
