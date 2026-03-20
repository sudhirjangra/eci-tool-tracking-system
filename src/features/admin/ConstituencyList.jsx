import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  Box,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Chip,
  Paper
} from '@mui/material';
import {
  Search as SearchIcon,
  MapPin as MapPinIcon,
} from '@mui/icons-material';

export default function ConstituencyList() {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch data using TanStack Query
  const { data: constituencies, isLoading, error } = useQuery({
    queryKey: ['constituencies'],
    queryFn: async () => {
      const { data: constData, error: constErr } = await supabase
        .from('constituencies')
        .select(`
          id,
          eci_id,
          eci_name,
          tool_name,
          states (name),
          assigned_tl_id,
          assigned_ra_id
        `)
        .order('states(name),eci_name', { ascending: true });

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

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-indigo-600 font-medium">Loading 1,000+ constituencies...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error loading data: {error.message}</div>;
  }

  // Filter based on search input (checks both ECI and Tool names)
  const filteredData = constituencies?.filter(c => 
    c.eci_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.tool_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.states?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.eci_id.toString().includes(searchTerm)
  );

  return (
    <Paper elevation={0} sx={{ 
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
      bgcolor: '#fff'
    }}>
      {/* Search Bar */}
      <Box sx={{
        p: 3,
        borderBottom: '1px solid #e2e8f0',
        bgcolor: '#f8fafc',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap'
      }}>
        <Box sx={{ flex: 1, minWidth: '300px' }}>
          <TextField
            placeholder="Search by constituency, state, or ECI ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: '#fff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                '&:hover': { borderColor: '#cbd5e1' },
                '&.Mui-focused': { borderColor: '#0f4c75' }
              }
            }}
          />
        </Box>
        <Box sx={{
          px: 3,
          py: 1.2,
          bgcolor: '#e0e7ff',
          border: '1px solid #c7d2fe',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#4f46e5' }}>
            {filteredData?.length}/{constituencies?.length}
          </Typography>
        </Box>
      </Box>

      {/* Table Container */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <Box sx={{
            p: 6,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2
          }}>
            <CircularProgress size={50} sx={{ color: '#0f4c75' }} />
            <Typography sx={{ color: '#64748b', fontWeight: 600 }}>
              Loading 1,000+ constituencies...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ p: 4, textAlign: 'center', color: '#dc2626' }}>
            <Typography>Error loading data: {error.message}</Typography>
          </Box>
        ) : filteredData?.length === 0 ? (
          <Box sx={{
            p: 8,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1
          }}>
            <Box sx={{ fontSize: '2.5rem', mb: 1 }}>🔍</Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#475569' }}>
              No constituencies found
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>
              Try adjusting your search terms for "{searchTerm}"
            </Typography>
          </Box>
        ) : (
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  State
                </TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  ECI ID
                </TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  ECI Name
                </TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  Tool Name
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  ECI Round
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  Tool Round
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  Team Lead
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b', py: 2 }}>
                  Research Analyst
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData?.map((row) => {
                const electionData = row.election_data?.[0] || { eci_round: 0, tool_round: 0 };
                return (
                  <TableRow
                    key={row.id}
                    sx={{
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'all 0.2s ease',
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    <TableCell sx={{ py: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MapPinIcon sx={{ fontSize: '1rem', color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.9rem', color: '#0f4c75', fontWeight: 600 }}>
                          {row.states?.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 2 }}>
                      <Chip
                        label={row.eci_id}
                        size="small"
                        sx={{
                          bgcolor: '#e0e7ff',
                          color: '#4f46e5',
                          fontWeight: 700,
                          fontFamily: 'monospace'
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 2 }}>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                        {row.eci_name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 2 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {row.tool_name || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 2 }}>
                      <Chip
                        label={electionData.eci_round}
                        size="small"
                        sx={{
                          bgcolor: '#e0e7ff',
                          color: '#4f46e5',
                          fontWeight: 700
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 2 }}>
                      <Chip
                        label={electionData.tool_round}
                        size="small"
                        sx={{
                          bgcolor: '#fce7f3',
                          color: '#be185d',
                          fontWeight: 700
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 2 }}>
                      {row.assigned_tl_id ? (
                        <Chip
                          label="Assigned"
                          size="small"
                          sx={{
                            bgcolor: '#d1fae5',
                            color: '#059669',
                            fontWeight: 700
                          }}
                        />
                      ) : (
                        <Chip
                          label="Unassigned"
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: '#e2e8f0',
                            color: '#64748b'
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center" sx={{ py: 2 }}>
                      {row.assigned_ra_id ? (
                        <Chip
                          label="Assigned"
                          size="small"
                          sx={{
                            bgcolor: '#d1fae5',
                            color: '#059669',
                            fontWeight: 700
                          }}
                        />
                      ) : (
                        <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Paper>
  );
}