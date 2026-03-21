import React, { useState, useEffect, useMemo } from 'react';
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
  Collapse,
  TextField,
  Select,
  MenuItem,
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
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';

export default function TLDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ra-status');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRAForMap, setSelectedRAForMap] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchRA, setSearchRA] = useState('');
  const [filterState, setFilterState] = useState('');

  // Get current user session on load
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
      if (!data.user) navigate('/login');
    });
  }, [navigate]);

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

  const { data: electionData, isLoading: loadingElectionData } = useQuery({
    queryKey: ['tl-election-data', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('election_data')
        .select('constituency_id, eci_round, tool_round, eci_last_updated_at, tool_last_updated_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser?.id,
  });

  // Get unique state names for dropdown
  const stateOptions = useMemo(() => {
    if (!myConstituencies) return [];
    const states = myConstituencies.map(c => c.states?.name).filter(Boolean);
    return Array.from(new Set(states)).sort();
  }, [myConstituencies]);

  // Filter and search logic for RA Performance
  const raStatusRows = useMemo(() => {
    if (!myRAs || !myConstituencies) return [];
    const map = Object.fromEntries((electionData || []).map((record) => [record.constituency_id, record]));

    return myRAs
      .filter(ra => {
        const matchName = ra.name?.toLowerCase().includes(searchRA.toLowerCase()) || ra.email?.toLowerCase().includes(searchRA.toLowerCase());
        if (searchRA && !matchName) return false;
        if (filterState) {
          // Only show RAs with at least one assigned constituency in the selected state
          const assigned = (myConstituencies || []).filter((c) => c.assigned_ra_id === ra.id && c.states?.name === filterState);
          return assigned.length > 0;
        }
        return true;
      })
      .map((ra) => {
        const assigned = (myConstituencies || []).filter((c) => c.assigned_ra_id === ra.id && (!filterState || c.states?.name === filterState));
        const territories = assigned.map((c) => {
          const data = map[c.id] || {};
          const eciLastUpdatedMillis = data.eci_last_updated_at ? new Date(data.eci_last_updated_at).getTime() : null;
          const toolLastUpdatedMillis = data.tool_last_updated_at ? new Date(data.tool_last_updated_at).getTime() : null;
          const eciLagSeconds = eciLastUpdatedMillis ? Math.max(0, Math.floor((Date.now() - eciLastUpdatedMillis) / 1000)) : null;
          const toolLagSeconds = toolLastUpdatedMillis ? Math.max(0, Math.floor((Date.now() - toolLastUpdatedMillis) / 1000)) : null;

          const territoryLagSeconds = Math.max(eciLagSeconds || 0, toolLagSeconds || 0);
          const status = (eciLastUpdatedMillis || toolLastUpdatedMillis) ?
            (territoryLagSeconds <= 60 ? 'Active' : territoryLagSeconds <= 120 ? 'Warning' : 'Inactive') : 'No Data';

          const latestUpdated = Math.max(eciLastUpdatedMillis || 0, toolLastUpdatedMillis || 0);

          return {
            id: c.id,
            state: c.states?.name || 'Unknown',
            eci_name: c.eci_name,
            tool_name: c.tool_name || '—',
            eci_round: data.eci_round ?? 0,
            tool_round: data.tool_round ?? 0,
            eci_last_updated_at: data.eci_last_updated_at ? new Date(data.eci_last_updated_at).toLocaleString() : '-',
            tool_last_updated_at: data.tool_last_updated_at ? new Date(data.tool_last_updated_at).toLocaleString() : '-',
            eciLagSeconds: eciLagSeconds !== null ? eciLagSeconds : '-',
            toolLagSeconds: toolLagSeconds !== null ? toolLagSeconds : '-',
            lagSeconds: territoryLagSeconds !== null ? territoryLagSeconds : '-',
            status,
          };
        });

        const lastUpdatedAt = territories
          .flatMap((x) => [x.eci_last_updated_at, x.tool_last_updated_at])
          .map((ts) => (ts && ts !== '-' ? new Date(ts).getTime() : 0))
          .filter(Boolean);
        const latestUpdate = lastUpdatedAt.length ? new Date(Math.max(...lastUpdatedAt)).toLocaleString() : '-';

        return {
          ...ra,
          assignedCount: assigned.length,
          lastUpdatedAt: latestUpdate,
          territories,
        };
      });
  }, [myRAs, myConstituencies, electionData, searchRA, filterState]);

  const formatLag = (seconds) => {
    if (seconds === null || seconds === '-' || seconds === undefined) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getLagPalette = (seconds) => {
    if (seconds === null || seconds === '-' || seconds === undefined) return { color: '#64748b' };
    if (seconds <= 60) return { color: '#047857' };
    if (seconds <= 120) return { color: '#92400e' };
    return { color: '#991b1b' };
  };

  const handleDeleteRA = async (raId, email, name) => {
    const displayName = name || email;
    const isConfirmed = window.confirm(
      `WARNING: Are you sure you want to remove ${displayName}?\n\nThis will permanently delete their account and return all their assigned territories back to your unassigned pool.`
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: '#f0f4f8', overflow: 'hidden' }}>
      {/* Top Navigation Header */}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
        color: '#fff',
        px: 4,
        py: 2.5,
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
            T
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 'bold', lineHeight: 1 }}>Elections 2026</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.5px' }}>TEAM LEAD DASHBOARD</Typography>
          </Box>
        </Box>

        {/* User Info & Logout */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right', pr: 2, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>Team Lead</Typography>
            <Typography sx={{ fontSize: '0.75rem', opacity: 0.8 }}>Delegation Portal</Typography>
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
        px: 4
      }}>
        <Button
          onClick={() => setActiveTab('my-map')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'my-map' ? 700 : 600,
            color: activeTab === 'my-map' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'my-map' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          My Territory
        </Button>
        <Button
          onClick={() => setActiveTab('manage-ras')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'manage-ras' ? 700 : 600,
            color: activeTab === 'manage-ras' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'manage-ras' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          Manage Research Analysts
        </Button>
        <Button
          onClick={() => setActiveTab('ra-status')}
          sx={{
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: activeTab === 'ra-status' ? 700 : 600,
            color: activeTab === 'ra-status' ? '#0f4c75' : '#94a3b8',
            py: 2,
            px: 3,
            borderBottom: activeTab === 'ra-status' ? '3px solid #0f4c75' : 'none',
            '&:hover': { color: '#0f4c75' }
          }}
        >
          RA Performance
        </Button>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5 }}>
        {activeTab === 'my-map' && (
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                My Territory
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                All constituencies assigned to you - Delegate to your research analysts
              </Typography>
            </Box>

            {loadingMap ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Loading your territory...</Typography>
              </Box>
            ) : (myConstituencies?.length ?? 0) === 0 ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e2e8f0'
              }}>
                <Box sx={{ fontSize: '3rem', mb: 2 }}>🗺️</Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                  No constituencies assigned
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                  Contact your admin to assign territories to you
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff', borderRadius: '12px' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>State</TableCell>
                      <TableCell>Constituency</TableCell>
                      <TableCell>Tool Name</TableCell>
                      <TableCell>Assignment</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(myConstituencies ?? []).map((constituency) => {
                      const assignedRAId = constituency.assigned_ra_id;
                      const assignedRAEmail = assignedRAId ? (myRAs || []).find((ra) => ra.id === assignedRAId)?.email : null;
                      const isDelegated = Boolean(assignedRAId);

                      return (
                        <TableRow key={constituency.id} hover>
                          <TableCell>{constituency.states?.name || 'Unknown'}</TableCell>
                          <TableCell>{constituency.eci_name}</TableCell>
                          <TableCell>{constituency.tool_name || '—'}</TableCell>
                          <TableCell>
                            {isDelegated ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#047857', fontWeight: 600 }}>
                                <Typography>✓</Typography>
                                <Typography>{assignedRAEmail ? `RA Delegated (${assignedRAEmail})` : 'RA Delegated'}</Typography>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#b45309', fontWeight: 600 }}>
                                <Typography>⚠</Typography>
                                <Typography>Delegate to an RA</Typography>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {activeTab === 'manage-ras' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
              <Box>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                  Research Analysts
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Manage your team of research analysts and delegate territories
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={() => setIsModalOpen(true)}
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
                Create Research Analyst
              </Button>
            </Box>

            {myRAs?.length === 0 ? (
              <Box sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e2e8f0'
              }}>
                <Box sx={{ fontSize: '3rem', mb: 2 }}>👥</Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', mb: 1 }}>
                  No research analysts yet
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8', mb: 3 }}>
                  Create your first research analyst to start delegating territories
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<PersonAddIcon />}
                  onClick={() => setIsModalOpen(true)}
                  sx={{
                    background: 'linear-gradient(135deg, #0f4c75 0%, #00a86b 100%)',
                    textTransform: 'none'
                  }}
                >
                  Create Research Analyst
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff', borderRadius: '12px' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Research Analyst</TableCell>
                      <TableCell align="center">Assigned Constituencies</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {myRAs.map((ra) => {
                      const assignedCount = (myConstituencies || []).filter((c) => c.assigned_ra_id === ra.id).length;
                      return (
                        <TableRow key={ra.id} hover>
                          <TableCell>{ra.name || ra.email}</TableCell>
                          <TableCell align="center">{assignedCount}</TableCell>
                          <TableCell align="center">
                            <Button
                              variant="contained"
                              startIcon={<EditIcon fontSize="small" />}
                              onClick={() => setSelectedRAForMap(ra)}
                              sx={{
                                background: 'linear-gradient(135deg, #0f4c75 0%, #1a5a8e 100%)',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                py: 0.5,
                                px: 1.5,
                                mr: 1
                              }}
                            >
                              Delegate
                            </Button>
                            <Button
                              variant="outlined"
                              startIcon={<DeleteIcon fontSize="small" />}
                              onClick={() => handleDeleteRA(ra.id, ra.email, ra.name)}
                              sx={{
                                borderColor: '#fecaca',
                                color: '#dc2626',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                py: 0.5,
                                px: 1.5,
                                '&:hover': { borderColor: '#dc2626', bgcolor: 'rgba(220, 38, 38, 0.05)' }
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {activeTab === 'ra-status' && (
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f4c75', mb: 0.5 }}>
                RA Performance Dashboard
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                Track assigned constituencies and ECI/Tool round progress for each RA.
              </Typography>
            </Box>

            {/* Filters */}
            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Search RA"
                variant="outlined"
                size="small"
                sx={{ minWidth: 200 }}
                value={searchRA}
                onChange={e => setSearchRA(e.target.value)}
              />
              <Select
                displayEmpty
                value={filterState}
                onChange={e => setFilterState(e.target.value)}
                size="small"
                sx={{ minWidth: 150, background: '#fff' }}
                renderValue={selected => selected || 'Filter by State'}
              >
                <MenuItem value=""><em>All States</em></MenuItem>
                {stateOptions.map(state => (
                  <MenuItem key={state} value={state}>{state}</MenuItem>
                ))}
              </Select>
            </Box>

            {loadingMap || loadingElectionData ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ color: '#0f4c75', fontWeight: 600 }}>Loading RA status...</Typography>
              </Box>
            ) : raStatusRows?.length === 0 ? (
              <Box sx={{ p: 8, textAlign: 'center', bgcolor: '#fff', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569' }}>No RAs found</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#94a3b8' }}>Create an RA to start tracking performance data.</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: '#fff' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Research Analyst</TableCell>
                      <TableCell align="center">Assigned Constituencies</TableCell>
                      <TableCell align="center">Latest Update</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {raStatusRows.map((item) => (
                      <React.Fragment key={item.id}>
                        <TableRow hover>
                          <TableCell>{item.name || item.email}</TableCell>
                          <TableCell align="center">{item.assignedCount}</TableCell>
                          <TableCell align="center">{item.lastUpdatedAt}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={3} sx={{ p: 0, borderBottom: 'none' }}>
                            <Collapse in={true} timeout="auto" unmountOnExit>                              <Box sx={{ p: 2, bgcolor: '#f9fafb' }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Constituency Details</Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow sx={{ backgroundColor: '#eef2ff' }}>
                                      <TableCell>State</TableCell>
                                      <TableCell>ECI Name</TableCell>
                                      <TableCell>Tool Name</TableCell>
                                      <TableCell align="center">ECI Round</TableCell>
                                      <TableCell align="center">Tool Round</TableCell>
                                      <TableCell align="center">ECI Updated</TableCell>
                                      <TableCell align="center">Tool Updated</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {item.territories.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={6} align="center">No assigned constituencies</TableCell>
                                      </TableRow>
                                    ) : (
                                      item.territories.map((territory) => (
                                        <TableRow key={territory.id}>
                                          <TableCell>{territory.state}</TableCell>
                                          <TableCell>{territory.eci_name}</TableCell>
                                          <TableCell>{territory.tool_name}</TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                              <Typography sx={{ fontWeight: 400, fontSize: '1rem', color: '#4f46e5' }}>{territory.eci_round}</Typography>
                                              <Typography variant="caption" sx={{ fontWeight: 400, fontFamily: 'monospace', color: '#64748b', mt: 0.5 }}>
                                                Lag: {formatLag(territory.eciLagSeconds)}
                                              </Typography>
                                            </Box>
                                          </TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                              <Typography sx={{ fontWeight: 400, fontSize: '1rem', color: '#be185d' }}>{territory.tool_round}</Typography>
                                              <Typography variant="caption" sx={{ fontWeight: 400, fontFamily: 'monospace', color: '#64748b', mt: 0.5 }}>
                                                Lag: {formatLag(territory.toolLagSeconds)}
                                              </Typography>
                                            </Box>
                                          </TableCell>
                                          <TableCell align="center">{territory.eci_last_updated_at}</TableCell>
                                          <TableCell align="center">{territory.tool_last_updated_at}</TableCell>
                                        </TableRow>
                                      ))
                                    )}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
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