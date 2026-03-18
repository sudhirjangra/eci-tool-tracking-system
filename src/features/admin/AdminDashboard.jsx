import { useState } from 'react';
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
  Card,
  CardHeader,
  CardContent,
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

  // Fetch ALL roles - optimized with useMemo to avoid N+1 lookups
  const { data: allRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase.from('user_roles').select('id, role, manager_id');
      const { data: emails, error: emailErr } = await supabase.rpc('get_all_user_emails');
      if (rolesErr || emailErr) throw rolesErr || emailErr;
      
      // Create email map for O(1) lookup instead of O(n) search
      const emailMap = {};
      emails.forEach(e => { emailMap[e.id] = e.email; });
      
      return roles.map(role => ({
        ...role,
        email: emailMap[role.id] || 'Unknown'
      }));
    },
    staleTime: 60000, // Cache for 60 seconds
  });

  // Fetch Team Leaders
  const { data: teamLeaders, refetch: refetchTLs, isLoading: tlLoading } = useQuery({
    queryKey: ['team-leaders'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_leaders_with_emails');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000, // Cache for 60 seconds
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

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            color: '#f1f5f9',
            borderRight: '1px solid #334155',
          },
        }}
      >
        <Box sx={{ p: 3, borderBottom: '1px solid #334155' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Avatar sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', width: 40, height: 40, fontWeight: 'bold' }}>
              E
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                ELECTION '26
              </Typography>
              <Typography variant="caption" sx={{ color: '#a78bfa', fontWeight: 600, letterSpacing: '0.05em' }}>
                COMMAND CENTER
              </Typography>
            </Box>
          </Box>
        </Box>

        <Stack spacing={1} sx={{ mt: 2, px: 1.5 }}>
          <Button
            fullWidth
            startIcon={<DashboardIcon />}
            variant={activeTab === 0 ? 'contained' : 'text'}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 0 ? '#fff' : '#cbd5e1',
              bgcolor: activeTab === 0 ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
              '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.15)' },
            }}
            onClick={() => setActiveTab(0)}
          >
            Live Monitor
          </Button>
          <Button
            fullWidth
            startIcon={<SettingsIcon />}
            variant={activeTab === 1 ? 'contained' : 'text'}
            sx={{
              justifyContent: 'flex-start',
              color: activeTab === 1 ? '#fff' : '#cbd5e1',
              bgcolor: activeTab === 1 ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
              '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.15)' },
            }}
            onClick={() => setActiveTab(1)}
          >
            Manage Team
          </Button>
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ p: 2, borderTop: '1px solid #334155' }}>
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
              {activeTab === 0 ? '📊 Real-Time Status Monitor' : '👥 Team Administration'}
            </Typography>
            <Avatar sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 'bold' }}>
              AD
            </Avatar>
          </Toolbar>
        </AppBar>

        {/* Content Area */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
          {activeTab === 0 && <AdminLiveMonitor />}

          {activeTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
              {/* Header with Search and Create Button */}
              <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                <CardHeader
                  title={
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Team Hierarchy
                    </Typography>
                  }
                  subheader="Manage Team Leaders and their deployed Research Analysts"
                  action={
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<PersonAddIcon />}
                      onClick={() => setIsTLModalOpen(true)}
                      sx={{ fontWeight: 600 }}
                    >
                      Create New TL
                    </Button>
                  }
                />
              </Card>

              {/* Search and Filter */}
              <Card elevation={0} sx={{ border: '1px solid #e2e8f0', mb: 2 }}>
                <CardContent sx={{ pb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search Team Leaders by email..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(0);
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                    }}
                    variant="outlined"
                  />
                </CardContent>
              </Card>

              {/* Team Leaders Table */}
              <Card elevation={0} sx={{ border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                        <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                          Team Leader
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                          Analysts
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedTLs.map((tl) => {
                        const myRAs = allRoles.filter(r => r.role === 'ra' && r.manager_id === tl.id);
                        const isExpanded = expandedTL === tl.id;

                        return (
                          <Box key={tl.id}>
                            {/* Main TL Row */}
                            <TableRow
                              sx={{
                                '&:hover': { bgcolor: '#f8fafc' },
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              onClick={() => setExpandedTL(isExpanded ? null : tl.id)}
                            >
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                  <Avatar sx={{ bgcolor: '#4f46e5', width: 36, height: 36, fontWeight: 'bold', fontSize: '0.75rem' }}>
                                    TL
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                                      {tl.email}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                      ID: {tl.id.slice(0, 8)}...
                                    </Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  label={`${myRAs.length} Analysts`}
                                  size="small"
                                  variant="outlined"
                                  color={myRAs.length > 0 ? 'success' : 'default'}
                                  icon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedUserForView(tl);
                                    }}
                                    color="primary"
                                    title="View Map"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTLForMap(tl);
                                    }}
                                    color="info"
                                    title="Edit Assignments"
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTL(tl.id, tl.email);
                                    }}
                                    color="error"
                                    title="Delete"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </TableCell>
                            </TableRow>

                            {/* Expanded RAs Row */}
                            <TableRow>
                              <TableCell colSpan={3} sx={{ p: 0, borderBottom: 'none' }}>
                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                  <Box sx={{ bgcolor: '#f8fafc', p: 2 }}>
                                    {myRAs.length === 0 ? (
                                      <Typography variant="body2" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                        No Research Analysts assigned yet
                                      </Typography>
                                    ) : (
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#64748b' }}>
                                              Research Analyst
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#64748b' }}>
                                              Action
                                            </TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {myRAs.map((ra) => (
                                            <TableRow key={ra.id} sx={{ '&:hover': { bgcolor: '#e0e7ff' } }}>
                                              <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                  <Avatar sx={{ bgcolor: '#10b981', width: 28, height: 28, fontWeight: 'bold', fontSize: '0.65rem' }}>
                                                    RA
                                                  </Avatar>
                                                  <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                                                      {ra.email}
                                                    </Typography>
                                                  </Box>
                                                </Box>
                                              </TableCell>
                                              <TableCell align="right">
                                                <Button
                                                  size="small"
                                                  variant="outlined"
                                                  color="success"
                                                  onClick={() => setSelectedUserForView(ra)}
                                                >
                                                  View Map
                                                </Button>
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
                          </Box>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Pagination */}
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25]}
                  component="div"
                  count={filteredTLs.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                />
              </Card>
            </Box>
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