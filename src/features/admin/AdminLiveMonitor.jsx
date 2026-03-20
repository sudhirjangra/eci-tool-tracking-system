import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

export default function AdminLiveMonitor() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [filterState, setFilterState] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterTL, setFilterTL] = useState('All');
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
        .select('constituency_id, eci_round, tool_round, eci_last_updated_at, tool_last_updated_at');

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

  // 2. Fetch User Emails for Translation
  const { data: userEmails } = useQuery({
    queryKey: ['all-user-emails'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_user_emails');
      if (error) throw error;
      return data || [];
    },
  });

  // Create a quick lookup dictionary for emails
  const emailMap = useMemo(() => {
    const map = {};
    userEmails?.forEach(u => { map[u.id] = u.email; });
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

  // 4. Local Timer - Reduced to 5 second updates for better performance
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
  }, [filterState, filterStatus, filterTL, searchTerm]);

  // 5. Process Data & Statuses
  const processedData = useMemo(() => {
    if (!rawData) return [];
    const getLagColor = (lagSeconds) => {
      if (lagSeconds === null) return {bg: '#e2e8f0', fg: '#64748b'};
      if (lagSeconds <= 60) return {bg: '#d1fae5', fg: '#047857'};
      if (lagSeconds <= 120) return {bg: '#fef3c7', fg: '#92400e'};
      return {bg: '#fee2e2', fg: '#991b1b'};
    };

    return rawData.map(row => {
      const data = row.election_data?.[0];
      const eciRound = data?.eci_round || 0;
      const toolRound = data?.tool_round || 0;
      const eciLastUpdatedMillis = data?.eci_last_updated_at ? new Date(data.eci_last_updated_at).getTime() : null;
      const toolLastUpdatedMillis = data?.tool_last_updated_at ? new Date(data.tool_last_updated_at).getTime() : null;

      const eciLagSeconds = eciLastUpdatedMillis ? Math.floor((now - eciLastUpdatedMillis) / 1000) : null;
      const toolLagSeconds = toolLastUpdatedMillis ? Math.floor((now - toolLastUpdatedMillis) / 1000) : null;

      let lagSeconds = null;
      let status = 'Not Started';
      let statusColor = 'default';
      let statusIcon = null;

      const latestLag = Math.max(eciLagSeconds || 0, toolLagSeconds || 0);
      if (eciLastUpdatedMillis || toolLastUpdatedMillis) {
        lagSeconds = latestLag;
        if (lagSeconds <= 60) {
          status = 'Active';
          statusColor = 'success';
          statusIcon = <ActiveIcon sx={{ fontSize: '0.8rem', animation: 'pulse 2s infinite' }} />;
        } else if (lagSeconds <= 120) {
          status = 'Warning';
          statusColor = 'warning';
          statusIcon = <WarningIcon sx={{ fontSize: '0.8rem' }} />;
        } else {
          status = 'Inactive';
          statusColor = 'error';
          statusIcon = <ErrorIcon sx={{ fontSize: '0.8rem' }} />;
        }
      }

      const tlEmail = emailMap[row.assigned_tl_id] || 'Unassigned';
      const raEmail = emailMap[row.assigned_ra_id] || 'Unassigned';

      return {
        ...row,
        eciRound,
        toolRound,
        eciLagSeconds,
        toolLagSeconds,
        lagSeconds,
        status,
        statusColor,
        statusIcon,
        tlEmail,
        raEmail,
      };
    });
  }, [rawData, now, emailMap]);

  // 6. Apply Filters
  const filteredData = processedData.filter(row => {
    const matchesSearch = row.eci_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = filterState === 'All' || row.states?.name === filterState;
    const matchesStatus = filterStatus === 'All' || row.status === filterStatus;
    const matchesTL = filterTL === 'All' || row.assigned_tl_id === filterTL;
    return matchesSearch && matchesState && matchesStatus && matchesTL;
  });

  const uniqueStates = [...new Set(rawData?.map(r => r.states?.name).filter(Boolean))];
  
  // Get unique TLs for the dropdown
  const uniqueTLs = useMemo(() => {
    if (!rawData) return [];
    const tlMap = new Map();
    rawData.forEach(r => {
      if (r.assigned_tl_id) tlMap.set(r.assigned_tl_id, emailMap[r.assigned_tl_id] || 'Unknown TL');
    });
    return Array.from(tlMap.entries());
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

  const stats = {
    active: processedData.filter(d => d.status === 'Active').length,
    warning: processedData.filter(d => d.status === 'Warning').length,
    inactive: processedData.filter(d => d.status === 'Inactive').length,
    total: processedData.length,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', bgcolor: '#f0f4f8', margin: 0, padding: 0 }}>
      {/* Top Section - Key Stats */}
      <Box sx={{ p: 1, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>
          {/* Active Stat */}
          <Box sx={{
            p: 1.5,
            px: 2,
            bgcolor: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
            border: '1px solid #86efac',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)',
            flex: 1,
            textAlign: 'center'
          }}>
            <Typography sx={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, letterSpacing: '0.5px', mb: 0.25 }}>ACTIVE</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#059669' }}>{stats.active}</Typography>
          </Box>

          {/* Warning Stat */}
          <Box sx={{
            p: 1.5,
            px: 2,
            bgcolor: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
            flex: 1,
            textAlign: 'center'
          }}>
            <Typography sx={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 600, letterSpacing: '0.5px', mb: 0.25 }}>WARNING</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#b45309' }}>{stats.warning}</Typography>
          </Box>

          {/* Inactive Stat */}
          <Box sx={{
            p: 1.5,
            px: 2,
            bgcolor: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.1)',
            flex: 1,
            textAlign: 'center'
          }}>
            <Typography sx={{ fontSize: '0.7rem', color: '#991b1b', fontWeight: 600, letterSpacing: '0.5px', mb: 0.25 }}>INACTIVE</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#991b1b' }}>{stats.inactive}</Typography>
          </Box>

          {/* Total Stat */}
          <Box sx={{
            p: 1.5,
            px: 2,
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.1)',
            flex: 1,
            textAlign: 'center'
          }}>
            <Typography sx={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: 600, letterSpacing: '0.5px', mb: 0.25 }}>TOTAL</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e40af' }}>{stats.total}</Typography>
          </Box>
        </Box>
      </Box>

      {/* Middle Section - Filters */}
      <Box sx={{ p: 1, px: 1.5, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search constituencies..."
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
        
        <FormControl sx={{ minWidth: 200 }} size="small">
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

        <FormControl sx={{ minWidth: 200 }} size="small">
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
            <MenuItem value="Active">Active (&lt;15s)</MenuItem>
            <MenuItem value="Warning">Warning (15-60s)</MenuItem>
            <MenuItem value="Inactive">Inactive (&gt;60s)</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 200 }} size="small">
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

        <Box sx={{ ml: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ px: 2, py: 1, bgcolor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#059669' }}>
              Showing {filteredData.length}/{stats.total}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Main Table Area */}
      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#f0f4f8' }}>
        <Box sx={{ m: 1, mx: 1.5, my: 1, bgcolor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: 'calc(100% - 0.5rem)' }}>
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
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Constituency</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>State</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>ECI Round</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Tool Round</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Lag Time</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Team Lead</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>Research Analyst</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((row) => (
                    <TableRow key={row.id} sx={{ '&:hover': { bgcolor: '#f8fafc' }, transition: 'all 0.2s ease', borderBottom: '1px solid #e2e8f0' }}>
                      <TableCell sx={{ py: 2 }}>
                        <Box sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2,
                          py: 1.2,
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          backgroundColor: row.status === 'Active' ? '#d1fae5' : row.status === 'Warning' ? '#fef3c7' : '#fee2e2',
                          color: row.status === 'Active' ? '#059669' : row.status === 'Warning' ? '#92400e' : '#991b1b',
                          border: row.status === 'Active' ? '1px solid #6ee7b7' : row.status === 'Warning' ? '1px solid #fcd34d' : '1px solid #fecaca'
                        }}>
                          {row.statusIcon}
                          {row.status}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f4c75' }}>
                          {row.eci_name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          {row.states?.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 2 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
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
                      <TableCell align="center" sx={{ py: 2 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
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
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              ...getLagPalette(row.toolLagSeconds)
                            }}
                          >
                            {formatLag(row.toolLagSeconds)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>
                          ECI {formatLag(row.eciLagSeconds)} | TOOL {formatLag(row.toolLagSeconds)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        {row.tlEmail === 'Unassigned' ? (
                          <Chip label="—" size="small" variant="outlined" />
                        ) : (
                          <Typography variant="body2" sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                            {row.tlEmail}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        {row.raEmail === 'Unassigned' ? (
                          <Chip label="—" size="small" variant="outlined" />
                        ) : (
                          <Typography variant="body2" sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                            {row.raEmail}
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