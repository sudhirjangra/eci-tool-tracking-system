import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
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
  const [filterTL, setFilterTL] = useState('All');
  const [filterRA, setFilterRA] = useState('All');
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
          id, eci_name, states(name),
          assigned_tl_id, assigned_ra_id
        `)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });

      if (constErr) throw constErr;

      // Separately fetch all election data
      const { data: electionData, error: electionErr } = await supabase
        .from('election_data')
        .select('constituency_id, eci_round, tool_round, eci_last_updated_at, eci_round_updated_at, tool_round_updated_at');

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
  });

  // Create a quick lookup dictionary for emails and names
  const emailMap = useMemo(() => {
    const map = {};
    userEmails?.forEach(u => { map[u.id] = { email: u.email, name: u.name }; });
    return map;
  }, [userEmails]);

  // 3. WebSockets for Live Updates
  useEffect(() => {
    const channel = supabase.channel('live-election-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_data' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-live-feed'] });
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [queryClient]);

  // 4. Local Timer & Forced Data Refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      // Refresh every 30 seconds for sure data from database
      queryClient.invalidateQueries({ queryKey: ['admin-live-feed'] });
    }, 1000 * 30); // 30 seconds
    return () => clearInterval(timer);
  }, [queryClient]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
  }, [filterState, filterStatus, filterTL, filterRA, searchTerm]);

  // 5. Process Data & Statuses
  const processedData = useMemo(() => {
    if (!rawData) return [];
    return rawData.map(row => {
      const data = row.election_data?.[0];
      const eciRound = data?.eci_round || 0;
      const toolRound = data?.tool_round || 0;
      const eciLastUpdatedMillis = data?.eci_last_updated_at ? new Date(data.eci_last_updated_at).getTime() : null;
      const eciRoundUpdatedMillis = data?.eci_round_updated_at ? new Date(data.eci_round_updated_at).getTime() : null;
      const toolRoundUpdatedMillis = data?.tool_round_updated_at ? new Date(data.tool_round_updated_at).getTime() : null;

      const eciLagSeconds = eciLastUpdatedMillis ? Math.floor((now - eciLastUpdatedMillis) / 1000) : null;
      const toolLagSeconds = toolRoundUpdatedMillis ? Math.floor((now - toolRoundUpdatedMillis) / 1000) : null;
      const eciRoundLagSeconds = eciRoundUpdatedMillis ? Math.floor((now - eciRoundUpdatedMillis) / 1000) : null;

      let status = 'Not Started';
      let statusColor = 'default';
      let statusIcon = null;

      const latestLag = Math.max(eciRoundLagSeconds || 0, toolLagSeconds || 0);
      if (eciRoundUpdatedMillis || toolRoundUpdatedMillis) {
        if (latestLag <= 60) {
          status = 'Active';
          statusColor = 'success';
          statusIcon = <ActiveIcon sx={{ fontSize: '0.8rem', animation: 'pulse 2s infinite' }} />;
        } else {
          status = 'Inactive';
          statusColor = 'error';
          statusIcon = <ErrorIcon sx={{ fontSize: '0.8rem' }} />;
        }
      }

      const tlEmail = emailMap[row.assigned_tl_id]?.email || 'Unassigned';
      const tlName = emailMap[row.assigned_tl_id]?.name || 'Unassigned';
      const raEmail = emailMap[row.assigned_ra_id]?.email || 'Unassigned';
      const raName = emailMap[row.assigned_ra_id]?.name || 'Unassigned';
      const syncDelta = eciRound - toolRound;
      const syncStatus = eciRound === 0 && toolRound === 0
        ? 'Not Started'
        : syncDelta === 0
          ? 'In Sync'
          : syncDelta > 0
            ? `ECI +${syncDelta}`
            : `Tool +${Math.abs(syncDelta)}`;

      return {
        ...row,
        eciRound,
        toolRound,
        eciLastUpdatedAt: data?.eci_last_updated_at || null,
        eciLagSeconds,
        toolLagSeconds,
        status,
        statusColor,
        statusIcon,
        tlEmail,
        tlName,
        raEmail,
        raName,
        syncStatus,
      };
    });
  }, [rawData, now, emailMap]);

  // 6. Apply Filters
  const filteredData = processedData.filter(row => {
    const matchesSearch = row.eci_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = filterState === 'All' || row.states?.name === filterState;
    const matchesStatus = filterStatus === 'All' || row.status === filterStatus;
    const matchesTL = filterTL === 'All' || row.assigned_tl_id === filterTL;
    const matchesRA = filterRA === 'All' || row.assigned_ra_id === filterRA;
    return matchesSearch && matchesState && matchesStatus && matchesTL && matchesRA;
  });

  const uniqueStates = [...new Set(rawData?.map(r => r.states?.name).filter(Boolean))];
  
  // Get unique TLs for the dropdown
  const uniqueTLs = useMemo(() => {
    if (!rawData) return [];
    const tlMap = new Map();
    rawData.forEach(r => {
      if (r.assigned_tl_id) {
        const mapped = emailMap[r.assigned_tl_id];
        tlMap.set(
          r.assigned_tl_id,
          mapped ? `${mapped.name || mapped.email} - ${mapped.email}` : r.assigned_tl_id
        );
      }
    });
    return Array.from(tlMap.entries());
  }, [rawData, emailMap]);

  const uniqueRAs = useMemo(() => {
    if (!rawData) return [];
    const raMap = new Map();
    rawData.forEach(r => {
      if (r.assigned_ra_id) {
        const mapped = emailMap[r.assigned_ra_id];
        raMap.set(
          r.assigned_ra_id,
          mapped ? `${mapped.name || mapped.email} - ${mapped.email}` : r.assigned_ra_id
        );
      }
    });
    return Array.from(raMap.entries());
  }, [rawData, emailMap]);

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

  const formatLag = (seconds) => {
    if (seconds === null) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getLagPalette = (seconds) => {
    if (seconds === null) return { bgcolor: '#e2e8f0', color: '#64748b' };
    if (seconds <= 60) return { bgcolor: '#d1fae5', color: '#047857' };
    if (seconds <= 120) return { bgcolor: '#fef3c7', color: '#92400e' };
    return { bgcolor: '#fee2e2', color: '#991b1b' };
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '--';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString();
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
          placeholder="Search constituencies..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
          }}
          sx={{
            minWidth: 200,
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
            <MenuItem value="Active">Active (&lt;1m)</MenuItem>
            <MenuItem value="Inactive">Inactive (&gt;1m)</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel>Team Leader</InputLabel>
          <Select
            value={filterTL}
            label="Team Leader"
            onChange={(e) => setFilterTL(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Team Leaders</MenuItem>
            {uniqueTLs.map(([id, email]) => (
              <MenuItem key={id} value={id}>{email}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 170 }} size="small">
          <InputLabel>Research Analyst</InputLabel>
          <Select
            value={filterRA}
            label="Research Analyst"
            onChange={(e) => setFilterRA(e.target.value)}
            sx={{
              bgcolor: '#f8fafc',
              borderRadius: '8px'
            }}
          >
            <MenuItem value="All">All Research Analysts</MenuItem>
            {uniqueRAs.map(([id, label]) => (
              <MenuItem key={id} value={id}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Box sx={{ px: 1.25, py: 0.5, bgcolor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>
              Showing {filteredData.length}/{processedData.length}
            </Typography>
          </Box>
        </Box>
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
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Constituency</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>State</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>ECI Round</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Tool Round</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Sync Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>ECI Last Updated</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Team Lead</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b', py: 1 }}>Research Analyst</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((row) => (
                    <TableRow key={row.id} sx={{ '&:hover': { bgcolor: '#f8fafc' }, transition: 'all 0.2s ease', borderBottom: '1px solid #e2e8f0' }}>
                      <TableCell sx={{ py: 1 }}>
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
                          {row.statusIcon}
                          {row.status}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f4c75', fontSize: '0.9rem' }}>
                          {row.eci_name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.88rem' }}>
                          {row.states?.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
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
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              ...getLagPalette(row.eciLagSeconds)
                            }}
                          >
                            {formatLag(row.eciLagSeconds)}
                          </Typography>
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
                      {/* <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>
                          ECI {formatLag(row.eciLagSeconds)} | TOOL {formatLag(row.toolLagSeconds)}
                        </Typography>
                      </TableCell> */}
                      {/* <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>
                          ECI {formatLag(row.eciLagSeconds)} | TOOL {formatLag(row.toolLagSeconds)}
                        </Typography>
                      </TableCell> */}
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