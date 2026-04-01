import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { getConstituencyName } from '../../lib/electionMetrics';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  Badge,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from '@mui/material';
import { MapPin, Layers } from 'lucide-react';

export default function ViewUserMapModal({ isOpen, onClose, user }) {
  const { data: territories, isLoading } = useQuery({
    queryKey: ['view-user-map', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const column = user.role === 'tl' ? 'assigned_tl_id' : 'assigned_ra_id';
      
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, eci_id, tool_name, states(name)`)
        .eq(column, user.id)
        .order('states(name)', { ascending: true })
        .order('tool_name', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && isOpen,
  });

  if (!user) return null;

  // Group constituencies by state
  const groupedByState = (territories || []).reduce((acc, terr) => {
    const state = terr.states?.name || 'Unknown';
    if (!acc[state]) acc[state] = [];
    acc[state].push(terr);
    return acc;
  }, {});

  const isTeamLead = user.role === 'tl';
  const headerColor = isTeamLead ? '#0f4c75' : '#00a86b';
  const accentColor = isTeamLead ? '#2a6fa6' : '#33c292';

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth PaperProps={{
      sx: { borderRadius: 2 }
    }}>
      <DialogTitle sx={{
        background: `linear-gradient(135deg, ${headerColor} 0%, ${accentColor} 100%)`,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontSize: '1.5rem',
        fontWeight: 700,
      }}>
        <MapPin size={28} />
        Assigned Territories
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 0 }}>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <Chip
              label={user.role.toUpperCase()}
              size="small"
              sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                backgroundColor: isTeamLead ? '#e3f2fd' : '#e0f5f1',
                color: isTeamLead ? '#0f4c75' : '#00a86b',
              }}
            />
            <Typography variant="body2" sx={{ color: '#666', fontWeight: 500 }}>
              {user.name ? `${user.name} (${user.email})` : user.email}
            </Typography>
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: headerColor }} />
          </Box>
        ) : territories?.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Layers size={48} style={{ color: '#ccc', marginBottom: 16 }} />
            <Typography color="textSecondary">
              No assigned territories
            </Typography>
          </Box>
        ) : (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <Badge
                badgeContent={territories.length}
                sx={{ '& .MuiBadge-badge': { backgroundColor: headerColor, color: 'white' } }}
              >
                <Layers size={20} style={{ color: headerColor }} />
              </Badge>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Total Constituencies: {territories.length}
              </Typography>
            </Box>

            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b' }}>State</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b' }}>ECI ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.72rem', color: '#64748b' }}>Constituency Name</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {territories.map((terr) => (
                    <TableRow key={terr.id} sx={{ '&:hover': { bgcolor: '#f8fafc' }, borderBottom: '1px solid #e2e8f0' }}>
                      <TableCell sx={{ py: 1 }}>{terr.states?.name || 'Unknown'}</TableCell>
                      <TableCell sx={{ py: 1, color: accentColor, fontWeight: 600 }}>{terr.eci_id}</TableCell>
                      <TableCell sx={{ py: 1, fontWeight: 500 }}>{getConstituencyName(terr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            backgroundColor: headerColor,
            '&:hover': { backgroundColor: accentColor },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}