import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import AdminLiveMonitor from './AdminLiveMonitor';
import ViewUserMapModal from './ViewUserMapModal';
import CreateTLModal from './CreateTLModal';
import AssignMapModal from './AssignMapModal';
import {
  Box,
  Drawer,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  Stack,
  Collapse,
  TablePagination,
  AppBar,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
  Dashboard as DashboardIcon,
  Visibility as VisibilityIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [isTLModalOpen, setIsTLModalOpen] = useState(false);
  const [selectedTLForMap, setSelectedTLForMap] = useState(null);
  const [selectedUserForView, setSelectedUserForView] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTL, setExpandedTL] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Fetch ALL roles - optimized
  const { data: allRoles } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase.from('user_roles').select('id, role, manager_id');
      const { data: emails, error: emailErr } = await supabase.rpc('get_all_user_emails');
      if (rolesErr || emailErr) throw rolesErr || emailErr;
      
      const emailMap = {};
      emails.forEach(e => { emailMap[e.id] = e.email; });
      
      return roles.map(role => ({
        ...role,
        email: emailMap[role.id] || 'Unknown'
      }));
    },
    staleTime: 60000,
  });

  // Fetch Team Leaders
  const { data: teamLeaders, refetch: refetchTLs } = useQuery({
    queryKey: ['team-leaders'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_leaders_with_emails');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleDeleteTL = async (tlId, email) => {
    if (!window.confirm(`Delete ${email}? This removes them and their RAs permanently.`)) return;
    const { error } = await supabase.rpc('delete_team_leader', { target_tl_id: tlId });
    if (error) alert(`Error: ${error.message}`);
    else refetchTLs();
  };

  const teamLeaderList = allRoles?.filter(r => r.role === 'tl') || [];
  const filteredTLs = teamLeaderList.filter(tl =>
    tl.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const paginatedTLs = filteredTLs.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100%', bgcolor: '#f8fafc', overflow: 'hidden' }}>
      {/* Sidebar Navigation */}
      <Drawer
        variant="permanent"
        sx={{
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 250, // Tightened sidebar width
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            color: '#f8fafc',
            borderRight: 'none',
          },
        }}
      >
        <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: '#3b82f6', width: 36, height: 36, fontWeight: 'bold' }}>E</Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>ELECTION '26</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, letterSpacing: 1 }}>COMMAND CENTER</Typography>
            </Box>
          </Box>
        </Box>

        <Stack spacing={0.5} sx={{ mt: 2, px: 1.5 }}>
          <Button
            fullWidth
            startIcon={<DashboardIcon fontSize="small" />}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 0 ? '#fff' : '#94a3b8',
              bgcolor: activeTab === 0 ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              fontWeight: activeTab === 0 ? 600 : 500,
              py: 1,
              '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.1)' },
            }}
            onClick={() => setActiveTab(0)}
          >
            Live Monitor
          </Button>
          <Button
            fullWidth
            startIcon={<SettingsIcon fontSize="small" />}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 1 ? '#fff' : '#94a3b8',
              bgcolor: activeTab === 1 ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              fontWeight: activeTab === 1 ? 600 : 500,
              py: 1,
              '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.1)' },
            }}
            onClick={() => setActiveTab(1)}
          >
            Manage Team
          </Button>
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button
            fullWidth
            startIcon={<LogoutIcon fontSize="small" />}
            onClick={handleLogout}
            sx={{ color: '#f87171', justifyContent: 'flex-start', py: 1, '&:hover': { bgcolor: 'rgba(248, 113, 113, 0.1)' } }}
          >
            Sign Out
          </Button>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, width: '100%' }}>
        
        {/* Compact Header */}
        <AppBar position="static" elevation={0} sx={{ bgcolor: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <Toolbar sx={{ minHeight: '60px !important', justifyContent: 'space-between', px: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '1.1rem' }}>
              {activeTab === 0 ? 'Real-Time Status Monitor' : 'Team Administration'}
            </Typography>
            <Avatar sx={{ bgcolor: '#f1f5f9', color: '#475569', width: 32, height: 32, fontSize: '0.875rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>
              AD
            </Avatar>
          </Toolbar>
        </AppBar>

        {/* Scrollable Content */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: activeTab === 0 ? 0 : 3, minWidth: 0, width: '100%' }}>
          {activeTab === 0 && <AdminLiveMonitor />}

          {activeTab === 1 && (
            <Paper elevation={0} sx={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
              
              {/* Consolidated Control Bar */}
              <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                  Team Hierarchy
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, maxWidth: 600, justifyContent: 'flex-end' }}>
                  <TextField
                    size="small"
                    placeholder="Search email..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} /></InputAdornment>,
                    }}
                    sx={{ width: 250, '& .MuiOutlinedInput-root': { bgcolor: '#f8fafc' } }}
                  />
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<PersonAddIcon fontSize="small" />}
                    onClick={() => setIsTLModalOpen(true)}
                    sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, textTransform: 'none', fontWeight: 600 }}
                  >
                    New TL
                  </Button>
                </Box>
              </Box>

              {/* Table Area */}
              <TableContainer sx={{ flex: 1, bgcolor: '#fff' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', py: 1.5 }}>Team Leader</TableCell>
                      <TableCell align="center" sx={{ bgcolor: '#f8fafc', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', py: 1.5 }}>Analysts</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#f8fafc', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', py: 1.5 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedTLs.map((tl) => {
                      const myRAs = allRoles.filter(r => r.role === 'ra' && r.manager_id === tl.id);
                      const isExpanded = expandedTL === tl.id;

                      return (
                        <React.Fragment key={tl.id}>
                          <TableRow hover onClick={() => setExpandedTL(isExpanded ? null : tl.id)} sx={{ cursor: 'pointer', '& > td': { borderBottom: isExpanded ? 'none' : '1px solid #e2e8f0' } }}>
                            <TableCell sx={{ py: 1.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar sx={{ bgcolor: '#e0e7ff', color: '#4f46e5', width: 32, height: 32, fontWeight: 700, fontSize: '0.75rem' }}>TL</Avatar>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>{tl.email}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ py: 1.5 }}>
                              <Chip 
                                label={myRAs.length} 
                                size="small" 
                                icon={isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />} 
                                sx={{ bgcolor: myRAs.length > 0 ? '#ecfdf5' : '#f1f5f9', color: myRAs.length > 0 ? '#059669' : '#64748b', fontWeight: 700, height: 24 }} 
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.5 }}>
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Button size="small" onClick={(e) => { e.stopPropagation(); setSelectedUserForView(tl); }} sx={{ minWidth: 0, px: 1, color: '#6366f1' }} title="View Map"><VisibilityIcon fontSize="small" /></Button>
                                <Button size="small" onClick={(e) => { e.stopPropagation(); setSelectedTLForMap(tl); }} sx={{ minWidth: 0, px: 1, color: '#3b82f6' }} title="Edit Access"><EditIcon fontSize="small" /></Button>
                                <Button size="small" onClick={(e) => { e.stopPropagation(); handleDeleteTL(tl.id, tl.email); }} sx={{ minWidth: 0, px: 1, color: '#ef4444' }} title="Delete"><DeleteIcon fontSize="small" /></Button>
                              </Stack>
                            </TableCell>
                          </TableRow>

                          {/* Nested RAs */}
                          <TableRow>
                            <TableCell colSpan={3} sx={{ py: 0, px: 0, borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ bgcolor: '#f8fafc', px: 4, py: 2, borderTop: '1px dashed #e2e8f0' }}>
                                  {myRAs.length === 0 ? (
                                    <Typography variant="body2" sx={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No active analysts deployed.</Typography>
                                  ) : (
                                    <Table size="small" sx={{ maxWidth: 600, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                                      <TableBody>
                                        {myRAs.map((ra) => (
                                          <TableRow key={ra.id} hover>
                                            <TableCell sx={{ borderBottom: 'none', py: 1 }}>
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Avatar sx={{ bgcolor: '#d1fae5', color: '#059669', width: 24, height: 24, fontWeight: 700, fontSize: '0.65rem' }}>RA</Avatar>
                                                <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#334155' }}>{ra.email}</Typography>
                                              </Box>
                                            </TableCell>
                                            <TableCell align="right" sx={{ borderBottom: 'none', py: 1 }}>
                                              <Button size="small" variant="text" sx={{ fontSize: '0.7rem', color: '#059669', py: 0 }} onClick={() => setSelectedUserForView(ra)}>View Map</Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                rowsPerPageOptions={[10, 25, 50]}
                component="div"
                count={filteredTLs.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                sx={{ borderTop: '1px solid #e2e8f0', bgcolor: '#fff' }}
              />
            </Paper>
          )}
        </Box>
      </Box>

      {/* Modals */}
      <ViewUserMapModal isOpen={!!selectedUserForView} onClose={() => setSelectedUserForView(null)} user={selectedUserForView} />
      <CreateTLModal isOpen={isTLModalOpen} onClose={() => setIsTLModalOpen(false)} onSuccess={() => { setIsTLModalOpen(false); refetchTLs(); }} />
      <AssignMapModal isOpen={!!selectedTLForMap} onClose={() => setSelectedTLForMap(null)} tl={selectedTLForMap} onSuccess={() => setSelectedTLForMap(null)} />
    </Box>
  );
}