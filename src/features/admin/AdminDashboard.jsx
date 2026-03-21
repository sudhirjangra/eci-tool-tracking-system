import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import AdminLiveMonitor from './AdminLiveMonitor';
import ViewUserMapModal from './ViewUserMapModal';
import ExpandableRATableRow from './ExpandableRATableRow';
import { Dialog, DialogTitle, DialogContent, Box, Drawer, Toolbar, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Avatar, Chip, TextField, InputAdornment, Stack, Collapse, TablePagination, AppBar, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CreateTLModal from './CreateTLModal';
import AssignMapModal from './AssignMapModal';
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
  const [raStatusTL, setRAStatusTL] = useState(null);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [isTLModalOpen, setIsTLModalOpen] = useState(false);
  const [selectedTLForMap, setSelectedTLForMap] = useState(null);
  const [selectedUserForView, setSelectedUserForView] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTLs, setExpandedTLs] = useState(new Set());

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

  const toggleExpandedTL = (tlId) => {
    const newExpanded = new Set(expandedTLs);
    if (newExpanded.has(tlId)) {
      newExpanded.delete(tlId);
    } else {
      newExpanded.add(tlId);
    }
    setExpandedTLs(newExpanded);
  };

  const teamLeaderList = allRoles?.filter(r => r.role === 'tl') || [];
  const filteredTLs = teamLeaderList.filter(tl =>
    tl.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: '#f0f4f8', overflow: 'hidden' }}>
      {/* Top Navigation Header */}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
        color: '#fff',
        px: 4,
        py: 2,
        borderBottom: '2px solid #1a5a8e',
        boxShadow: '0 4px 12px rgba(15, 76, 117, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Logo/Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{
            width: 44,
            height: 44,
            bgcolor: 'rgba(255,255,255,0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            border: '2px solid rgba(255,255,255,0.3)'
          }}>
            E
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 'bold', lineHeight: 1 }}>Elections 2026</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>ADMIN CONTROL CENTER</Typography>
          </Box>
        </Box>

        {/* User Info & Logout */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right', pr: 2, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>Admin</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8 }}>Command Center</Typography>
          </Box>
          <Button
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
            sx={{ 
              color: '#fff', 
              textTransform: 'none',
              fontSize: '0.9rem',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' }
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Tab Navigation */}
      <Box sx={{
        bgcolor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: 0,
        px: 1.5
      }}>
        <Button
          onClick={() => setActiveTab(0)}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 0 ? 700 : 600,
            color: activeTab === 0 ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 0 ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          Live Monitor
        </Button>
        <Button
          onClick={() => setActiveTab(1)}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 1 ? 700 : 600,
            color: activeTab === 1 ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 1 ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          Team Administration
        </Button>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 0 }}>
        {activeTab === 0 && <AdminLiveMonitor />}

        {activeTab === 1 && (
          <Box sx={{ p: 1.5, height: '100%', overflow: 'auto' }}>
            {/* Control Bar */}
            <Box sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
              gap: 2,
              flexWrap: 'wrap'
            }}>
              <Box>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                  Team Leadership Structure
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Manage team leaders and their research analysts
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  placeholder="Search team leaders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
                  }}
                  sx={{
                    width: 300,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#fff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#cbd5e1' },
                      '&.Mui-focused': { borderColor: '#0f4c75' }
                    }
                  }}
                />
                <Button
                  variant="contained"
                  startIcon={<PersonAddIcon />}
                  onClick={() => setIsTLModalOpen(true)}
                  sx={{
                    background: 'linear-gradient(135deg, #0f4c75 0%, #00a86b 100%)',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    py: 1.2,
                    px: 2.5,
                    borderRadius: '8px',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(15, 76, 117, 0.3)'
                    }
                  }}
                >
                  Add Team Leader
                </Button>
              </Box>
            </Box>

            {/* Team Leaders Table */}
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Team Leader Email</TableCell>
                    <TableCell>Research Analysts (Emails)</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTLs.map((tl) => {
                    const myRAs = allRoles.filter(r => r.role === 'ra' && r.manager_id === tl.id);
                    return (
                      <TableRow key={tl.id}>
                        <TableCell>{tl.email}</TableCell>
                        <TableCell>
                          {myRAs.length > 0 ? myRAs.map(ra => ra.email).join(', ') : <span style={{ color: '#94a3b8' }}>No RAs</span>}
                        </TableCell>
                        <TableCell align="center">
                          <Button size="small" variant="outlined" startIcon={<VisibilityIcon fontSize="small" />} onClick={() => setSelectedUserForView(tl)} sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#cbd5e1', color: '#475569', minWidth: '90px', mr: 1 }}>
                            View Map
                          </Button>
                          <Button size="small" variant="outlined" startIcon={<EditIcon fontSize="small" />} onClick={() => setSelectedTLForMap(tl)} sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#cbd5e1', color: '#475569', minWidth: '90px', mr: 1 }}>
                            Assign
                          </Button>
                          <Button size="small" variant="outlined" startIcon={<DeleteIcon fontSize="small" />} onClick={() => handleDeleteTL(tl.id, tl.email)} sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#fecaca', color: '#dc2626', minWidth: '90px', mr: 1 }}>
                            Delete
                          </Button>
                          <Button size="small" variant="contained" color="info" onClick={() => setRAStatusTL(tl)} sx={{ textTransform: 'none', fontWeight: 600, minWidth: '90px' }}>
                            RA Status
                          </Button>
                        </TableCell>
                            {/* RA Status Popup */}
                            <Dialog open={!!raStatusTL} onClose={() => setRAStatusTL(null)} maxWidth="md" fullWidth
                              sx={{
                                '& .MuiBackdrop-root': {
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  backdropFilter: 'blur(6px)'
                                }
                              }}
                            >
                              <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                RA Status for Team Leader
                                <IconButton onClick={() => setRAStatusTL(null)} size="small"><CloseIcon /></IconButton>
                              </DialogTitle>
                              <DialogContent>
                                {raStatusTL && (
                                  <Box>
                                    <Typography sx={{ fontWeight: 600, mb: 2 }}>Team Leader: {raStatusTL.email}</Typography>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>RA Email</TableCell>
                                          <TableCell>Role</TableCell>
                                          <TableCell>Manager</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {allRoles.filter(r => r.role === 'ra' && r.manager_id === raStatusTL.id).map(ra => (
                                          <ExpandableRATableRow key={ra.id} ra={ra} managerEmail={raStatusTL.email} />
                                        ))}
                                      </TableBody>
                                    </Table>
                                    {allRoles.filter(r => r.role === 'ra' && r.manager_id === raStatusTL.id).length === 0 && (
                                      <Typography sx={{ color: '#94a3b8', mt: 2 }}>No research analysts assigned yet.</Typography>
                                    )}
                                  </Box>
                                )}
                              </DialogContent>
                            </Dialog>

                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {filteredTLs.length === 0 && (
              <Box sx={{
                textAlign: 'center',
                py: 8,
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                  No team leaders found
                </Typography>
                <Typography sx={{ fontSize: '0.95rem', color: '#94a3b8' }}>
                  {searchTerm ? 'Try adjusting your search terms' : 'Create a team leader to get started'}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Modals */}
      <ViewUserMapModal isOpen={!!selectedUserForView} onClose={() => setSelectedUserForView(null)} user={selectedUserForView} />
      <CreateTLModal isOpen={isTLModalOpen} onClose={() => setIsTLModalOpen(false)} onSuccess={() => { setIsTLModalOpen(false); refetchTLs(); }} />
      <AssignMapModal isOpen={!!selectedTLForMap} onClose={() => setSelectedTLForMap(null)} tl={selectedTLForMap} onSuccess={() => setSelectedTLForMap(null)} />
    </Box>
  );
}