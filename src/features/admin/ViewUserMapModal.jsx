import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
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
  Grid,
  Badge,
  Chip,
  Stack,
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
        .select(`id, eci_id, eci_name, tool_name, states(name)`)
        .eq(column, user.id)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });

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
            <Typography variant="body2" sx={{ color: '#666' }}>
              {user.email}
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

            <Stack spacing={3}>
              {Object.entries(groupedByState).map(([state, constits]) => (
                <Paper key={state} sx={{ p: 2.5, borderRadius: 1.5, border: '1px solid #e0e0e0' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a202c' }}>
                      {state}
                    </Typography>
                    <Chip
                      label={constits.length}
                      size="small"
                      sx={{
                        backgroundColor: isTeamLead ? '#e3f2fd' : '#e0f5f1',
                        color: headerColor,
                        fontWeight: 700,
                      }}
                    />
                  </Box>

                  <Grid container spacing={2}>
                    {constits.map((terr) => (
                      <Grid item xs={12} sm={6} key={terr.id}>
                        <Paper sx={{
                          p: 2,
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: 1,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            borderColor: accentColor,
                            backgroundColor: '#f0f9ff',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          },
                        }}>
                          <Typography variant="caption" sx={{
                            fontWeight: 700,
                            color: accentColor,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            display: 'block',
                            mb: 0.5,
                          }}>
                            ECI ID: {terr.eci_id}
                          </Typography>
                          <Typography variant="body2" sx={{
                            fontWeight: 600,
                            color: '#1a202c',
                            mb: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {terr.eci_name}
                          </Typography>
                          {terr.tool_name && (
                            <Typography variant="caption" sx={{
                              color: '#666',
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {terr.tool_name}
                            </Typography>
                          )}
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              ))}
            </Stack>
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