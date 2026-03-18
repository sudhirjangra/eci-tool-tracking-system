import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
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
  const [activeTab, setActiveTab] = useState('my-map');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRAForMap, setSelectedRAForMap] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Get current user session on load
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user));
  }, []);

  // Fetch the TL's assigned constituencies
  const { data: myConstituencies, isLoading: loadingMap } = useQuery({
    queryKey: ['tl-constituencies', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('constituencies')
        .select('id, eci_name, tool_name, states(name), assigned_ra_id')
        .eq('assigned_tl_id', currentUser.id)
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id,
  });

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

  const handleDeleteRA = async (raId, email) => {
    const isConfirmed = window.confirm(
      `WARNING: Are you sure you want to remove ${email}?\n\nThis will permanently delete their account and return all their assigned territories back to your unassigned pool.`
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
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f5f7fa' }}>
      {/* Sidebar Navigation */}
      <Drawer
        variant="permanent"
        sx={{
          width: 280,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 280,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)',
            color: '#f1f5f9',
            borderRight: '1px solid #059669',
          },
        }}
      >
        <Box sx={{ p: 3, borderBottom: '1px solid #059669' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Avatar sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', width: 40, height: 40, fontWeight: 'bold' }}>
              T
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                TEAM LEADER
              </Typography>
              <Typography variant="caption" sx={{ color: '#6ee7b7', fontWeight: 600, letterSpacing: '0.05em' }}>
                PORTAL
              </Typography>
            </Box>
          </Box>
        </Box>

        <Stack spacing={1} sx={{ mt: 2, px: 1.5 }}>
          <Button
            fullWidth
            startIcon={<MapIcon />}
            variant={activeTab === 0 ? 'contained' : 'text'}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 0 ? '#fff' : '#d1fae5',
              bgcolor: activeTab === 0 ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.15)' },
            }}
            onClick={() => setActiveTab(0)}
          >
            My Territory
          </Button>
          <Button
            fullWidth
            startIcon={<PeopleIcon />}
            variant={activeTab === 1 ? 'contained' : 'text'}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 1 ? '#fff' : '#d1fae5',
              bgcolor: activeTab === 1 ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.15)' },
            }}
            onClick={() => setActiveTab(1)}
          >
            Manage RAs
          </Button>
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ p: 2, borderTop: '1px solid #059669' }}>
          <Button
            fullWidth
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{
              color: '#fca5a5',
              '&:hover': { bgcolor: 'rgba(248, 113, 113, 0.1)' },
              justifyContent: 'flex-start',
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Header */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: '#ffffff',
            color: '#1e293b',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between', py: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {activeTab === 0 ? '🗺️ My Territory' : '👥 Manage Research Analysts'}
            </Typography>
            <Avatar sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 'bold' }}>
              TL
            </Avatar>
          </Toolbar>
        </AppBar>

        {/* Content Area */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
          {activeTab === 0 && (
            <Card elevation={0} sx={{ border: '1px solid #e2e8f0', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title={
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Assigned Constituencies ({myConstituencies?.length || 0})
                  </Typography>
                }
              />
              <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
                {loadingMap ? (
                  <Box sx={{ p: 3, textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                    Loading your territory...
                  </Box>
                ) : myConstituencies?.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center', color: '#64748b' }}>
                    <Typography variant="body2">No constituencies assigned yet.</Typography>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table stickyHeader>
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                          <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            Constituency (ECI)
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            State
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            RA Status
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {myConstituencies.map((row) => (
                          <TableRow key={row.id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                            <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>
                              {row.eci_name}
                            </TableCell>
                            <TableCell sx={{ color: '#64748b' }}>
                              {row.states?.name}
                            </TableCell>
                            <TableCell align="center">
                              {row.assigned_ra_id ? (
                                <Chip
                                  label="Assigned"
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                />
                              ) : (
                                <Chip
                                  label="Needs RA"
                                  size="small"
                                  color="warning"
                                  variant="filled"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
              {/* Header with Create Button */}
              <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                <CardHeader
                  title={
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      My Research Analysts ({myRAs?.length || 0})
                    </Typography>
                  }
                  action={
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<PersonAddIcon />}
                      onClick={() => setIsModalOpen(true)}
                      sx={{ fontWeight: 600 }}
                    >
                      Create RA
                    </Button>
                  }
                />
              </Card>

              {/* RAs Table */}
              {myRAs?.length === 0 ? (
                <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                  <CardContent sx={{ p: 6, textAlign: 'center' }}>
                    <PeopleIcon sx={{ fontSize: 60, color: '#dbeafe', mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                      No Research Analysts Yet
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b', maxWidth: '300px', mx: 'auto' }}>
                      Create your first Research Analyst to start delegating your territory.
                    </Typography>
                  </CardContent>
                </Card>
              ) : (
                <Card elevation={0} sx={{ border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <TableContainer sx={{ flex: 1 }}>
                    <Table stickyHeader>
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                          <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            Research Analyst
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            Role
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {myRAs.map((ra) => (
                          <TableRow key={ra.id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar sx={{ bgcolor: '#10b981', width: 36, height: 36, fontWeight: 'bold', fontSize: '0.75rem' }}>
                                  RA
                                </Avatar>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                                    {ra.email}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={ra.role?.toUpperCase()}
                                size="small"
                                variant="outlined"
                                color="success"
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <IconButton
                                  size="small"
                                  onClick={() => setSelectedRAForMap(ra)}
                                  color="success"
                                  title="Delegate Territory"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteRA(ra.id, ra.email)}
                                  color="error"
                                  title="Delete"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              )}
            </Box>
          )}
        </Box>
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