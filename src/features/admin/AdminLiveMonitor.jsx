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
      const { data, error } = await supabase
        .from('constituencies')
        .select(`
          id, eci_name, states(name),
          assigned_tl_id, assigned_ra_id,
          election_data ( eci_round, tool_round, last_updated_at )
        `)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });
      if (error) throw error;
      return data;
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
    return rawData.map(row => {
      const data = row.election_data?.[0];
      const eciRound = data?.eci_round || 0;
      const toolRound = data?.tool_round || 0;
      const lastUpdated = data?.last_updated_at ? new Date(data.last_updated_at).getTime() : null;
      
      let lagSeconds = null;
      let status = 'Not Started';
      let statusColor = 'default';
      let statusIcon = null;

      if (lastUpdated) {
        lagSeconds = Math.floor((now - lastUpdated) / 1000);
        if (lagSeconds < 15) {
          status = 'Active';
          statusColor = 'success';
          statusIcon = <ActiveIcon sx={{ fontSize: '0.8rem', animation: 'pulse 2s infinite' }} />;
        } else if (lagSeconds <= 60) {
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

      return { ...row, eciRound, toolRound, lagSeconds, status, statusColor, statusIcon, tlEmail, raEmail };
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

  const stats = {
    active: processedData.filter(d => d.status === 'Active').length,
    warning: processedData.filter(d => d.status === 'Warning').length,
    inactive: processedData.filter(d => d.status === 'Inactive').length,
    total: processedData.length,
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: '100%', width: '100%' }}>
      {/* LEFT SIDEBAR - Stats & Filters (Compact) */}
      <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto', pb: 2 }}>
        {/* Key Metrics - Compact Cards */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, px: 1.5, color: '#64748b' }}>
            Quick Stats
          </Typography>
          
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <Avatar sx={{ bgcolor: '#10b981', width: 36, height: 36, fontSize: '0.9rem' }}>
              <ActiveIcon sx={{ fontSize: '1.2rem' }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                Active
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#10b981', fontSize: '1.1rem' }}>
                {stats.active}
              </Typography>
            </Box>
          </Card>

          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', bgcolor: '#fffbeb', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <Avatar sx={{ bgcolor: '#f59e0b', width: 36, height: 36, fontSize: '0.9rem' }}>
              <WarningIcon sx={{ fontSize: '1.2rem' }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                Warning
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#f59e0b', fontSize: '1.1rem' }}>
                {stats.warning}
              </Typography>
            </Box>
          </Card>

          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', bgcolor: '#fef2f2', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <Avatar sx={{ bgcolor: '#ef4444', width: 36, height: 36, fontSize: '0.9rem' }}>
              <ErrorIcon sx={{ fontSize: '1.2rem' }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                Inactive
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#ef4444', fontSize: '1.1rem' }}>
                {stats.inactive}
              </Typography>
            </Box>
          </Card>

          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', bgcolor: '#f0f9ff', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <Avatar sx={{ bgcolor: '#3b82f6', width: 36, height: 36, fontSize: '0.9rem', fontWeight: 'bold' }}>
              📊
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                Total
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#3b82f6', fontSize: '1.1rem' }}>
                {stats.total}
              </Typography>
            </Box>
          </Card>
        </Box>

        {/* Filters Card */}
        <Card elevation={0} sx={{ border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <CardHeader
            title={
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Filters
              </Typography>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, p: '12px', overflow: 'auto' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: '1.1rem' }} />
                  </InputAdornment>
                ),
              }}
              variant="outlined"
              sx={{ '& input': { fontSize: '0.85rem' } }}
            />

            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.85rem' }}>State</InputLabel>
              <Select
                value={filterState}
                label="State"
                onChange={(e) => setFilterState(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
              >
                <MenuItem value="All">All States</MenuItem>
                {uniqueStates.map(state => (
                  <MenuItem key={state} value={state}>{state}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.85rem' }}>Status</InputLabel>
              <Select
                value={filterStatus}
                label="Status"
                onChange={(e) => setFilterStatus(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
              >
                <MenuItem value="All">All Statuses</MenuItem>
                <MenuItem value="Active">Active (&lt;15s)</MenuItem>
                <MenuItem value="Warning">Warning (15-60s)</MenuItem>
                <MenuItem value="Inactive">Inactive (&gt;60s)</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.85rem' }}>Team Leader</InputLabel>
              <Select
                value={filterTL}
                label="Team Leader"
                onChange={(e) => setFilterTL(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
              >
                <MenuItem value="All">All Team Leaders</MenuItem>
                {uniqueTLs.map(([id, email]) => (
                  <MenuItem key={id} value={id}>{email}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ bgcolor: '#f1f5f9', p: 1, borderRadius: 1, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748b' }}>
                Showing {filteredData.length}/{stats.total}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* RIGHT SIDE - Main Table (Full Width) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

      {/* Table Section */}
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <CardHeader
          title={
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Live Election Data
            </Typography>
          }
          sx={{ pb: 1.5 }}
        />
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          {loadingData ? (
            <Box sx={{ p: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <CircularProgress size={40} />
              <Typography sx={{ color: '#64748b', fontWeight: 600 }}>
                Establishing secure live feed...
              </Typography>
            </Box>
          ) : filteredData.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center', color: '#94a3b8' }}>
              <Typography variant="body2">No data matches your filters. Try adjusting your search criteria.</Typography>
            </Box>
          ) : (
            <Table stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                  <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Constituency
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Rounds
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Lag Time
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Team Leader
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                    Research Analyst
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.map((row) => (
                  <TableRow key={row.id} sx={{ '&:hover': { bgcolor: '#f8fafc' }, transition: 'all 0.2s ease' }}>
                    <TableCell>
                      <Chip
                        icon={row.statusIcon}
                        label={row.status}
                        size="small"
                        color={row.statusColor}
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                          {row.eci_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {row.states?.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Chip
                          label={`ECI: ${row.eciRound}`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`Tool: ${row.toolRound}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', color: '#64748b' }}>
                        {formatLag(row.lagSeconds)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.tlEmail === 'Unassigned' ? (
                        <Chip label="Unassigned" size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" sx={{ color: '#1e293b' }}>
                          {row.tlEmail}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.raEmail === 'Unassigned' ? (
                        <Chip label="Unassigned" size="small" variant="outlined" color="error" />
                      ) : (
                        <Typography variant="body2" sx={{ color: '#1e293b' }}>
                          {row.raEmail}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[50, 100, 250]}
          component="div"
          count={filteredData.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{ borderTop: '1px solid #e2e8f0' }}
        />
      </Card>
    </Box>
  );
}