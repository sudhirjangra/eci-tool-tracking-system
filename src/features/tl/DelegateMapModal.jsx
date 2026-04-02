import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  CircularProgress,
  Alert,
  InputAdornment,
  Stack,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Map, Search } from 'lucide-react';

export default function DelegateMapModal({ isOpen, onClose, ra, tlId, onSuccess }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedState, setSelectedState] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const { data: constituencies, isLoading } = useQuery({
    queryKey: ['tl-delegation-map', tlId],
    queryFn: async () => {
      if (!tlId) return [];
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, state_id, eci_id, tool_name, states(name), assigned_ra_id`)
        .eq('assigned_tl_id', tlId)
        .order('states(name)', { ascending: true })
        .order('tool_name', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tlId && isOpen, 
  });

  const { data: userEmails } = useQuery({
    queryKey: ['all-user-emails-delegate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, email, name');
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  const raInfoMap = useMemo(() => {
    const map = {};
    userEmails?.forEach((u) => {
      map[u.id] = {
        name: u.name || u.email,
        email: u.email,
        display: u.name ? `${u.name} (${u.email})` : u.email
      };
    });
    return map;
  }, [userEmails]);

  const states = [...new Set((constituencies || []).map(c => c.states?.name).filter(Boolean))].sort();

  const isDisabledConstituency = (c) => c.assigned_ra_id && c.assigned_ra_id !== ra.id;

  useEffect(() => {
    if (constituencies && ra) {
      const alreadyAssigned = constituencies
        .filter(c => c.assigned_ra_id === ra.id)
        .map(c => c.id);
      setSelectedIds(new Set(alreadyAssigned));
    }
  }, [constituencies, ra?.id]);

  if (!ra) return null;

  const handleToggle = (id) => {
    const constituency = constituencies?.find((c) => c.id === id);
    if (!constituency || isDisabledConstituency(constituency)) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStateSelect = (stateName) => {
    setSelectedState((prevState) => (prevState === stateName ? '' : stateName));
    setSearchTerm('');
  };

  const handleSelectAll = () => {
    setSelectedIds((prevSelected) => {
      const eligibleIds = filteredData
        .filter((c) => !isDisabledConstituency(c))
        .map((c) => c.id);
      const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => prevSelected.has(id));

      if (allSelected) {
        const next = new Set(prevSelected);
        eligibleIds.forEach((id) => next.delete(id));
        return next;
      }

      const next = new Set(prevSelected);
      eligibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    const originalIds = new Set(constituencies.filter(c => c.assigned_ra_id === ra.id).map(c => c.id));
    const idsToAssign = [...selectedIds].filter(id => !originalIds.has(id));
    const idsToUnassign = [...originalIds].filter(id => !selectedIds.has(id));

    try {
      if (idsToAssign.length > 0) {
        const { error: assignError } = await supabase
          .from('constituencies')
          .update({ assigned_ra_id: ra.id })
          .in('id', idsToAssign);
        if (assignError) throw assignError;
      }

      if (idsToUnassign.length > 0) {
        const { error: unassignError } = await supabase
          .from('constituencies')
          .update({ assigned_ra_id: null })
          .in('id', idsToUnassign);
        if (unassignError) throw unassignError;
      }

      await queryClient.invalidateQueries({ queryKey: ['tl-delegation-map', tlId] });
      await queryClient.invalidateQueries({ queryKey: ['tl-constituencies', tlId] });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredData = (selectedState 
    ? constituencies?.filter(c => c.states?.name === selectedState)
    : constituencies || []
  ).filter(c => 
    c.tool_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.eci_id.toString().includes(searchTerm)
  ) || [];

  const stateStats = states.map(state => {
    const stateConstituencies = (constituencies || []).filter(c => c.states?.name === state);
    const selectedCount = stateConstituencies.filter(c => selectedIds.has(c.id)).length;
    return { state, total: stateConstituencies.length, selected: selectedCount };
  });

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{
      sx: { borderRadius: 2, height: '90vh', display: 'flex', flexDirection: 'column' }
    }}>
      <DialogTitle sx={{
        background: 'linear-gradient(135deg, #00a86b 0%, #33c292 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontSize: '1.5rem',
        fontWeight: 700,
      }}>
        <Map size={28} />
        Delegate Territories to Research Analyst
      </DialogTitle>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - States */}
        <Box sx={{
          width: 280,
          borderRight: '1px solid #e0e0e0',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              SELECT STATE
            </Typography>
            <Typography variant="caption" sx={{ color: '#666' }}>
              Click to filter territories
            </Typography>
          </Box>

          <List sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {stateStats.map(({ state, total, selected }) => (
              <ListItemButton
                key={state}
                selected={selectedState === state}
                onClick={() => handleStateSelect(state)}
                sx={{
                  mb: 0.5,
                  borderRadius: 1,
                  backgroundColor: selectedState === state ? '#00a86b' : 'transparent',
                  color: selectedState === state ? 'white' : '#333',
                  '&:hover': {
                    backgroundColor: selectedState === state ? '#00a86b' : '#e8e8e8',
                  },
                }}
              >
                <ListItemText
                  primary={state}
                  secondary={`${selected}/${total}`}
                  secondaryTypographyProps={{
                    sx: {
                      color: selectedState === state ? 'rgba(255,255,255,0.7)' : '#666',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }
                  }}
                  sx={{ m: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Right Panel - Territories */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
            {/* User Info */}
            <Box sx={{ mb: 2 }}>
              <Chip
                label={`Research Analyst: ${ra.name ? `${ra.name} (${ra.email})` : ra.email}`}
                sx={{
                  backgroundColor: '#e0f5f1',
                  color: '#00a86b',
                  fontWeight: 600,
                }}
              />
            </Box>

            {/* Search Bar */}
            <TextField
              fullWidth
              size="small"
              placeholder={selectedState ? `Search in ${selectedState}...` : 'Search territories...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} style={{ color: '#999' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            {/* Selection Info */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <Button
                size="small"
                onClick={handleSelectAll}
                variant={filteredData.length === filteredData.filter(c => selectedIds.has(c.id)).length ? 'contained' : 'outlined'}
                sx={{
                  backgroundColor: filteredData.length === filteredData.filter(c => selectedIds.has(c.id)).length ? '#00a86b' : undefined,
                }}
              >
                {filteredData.length === filteredData.filter(c => selectedIds.has(c.id)).length && filteredData.length > 0 
                  ? 'Deselect All' 
                  : 'Select All'}
              </Button>
              <Chip
                label={`${selectedIds.size} Selected`}
                sx={{
                  backgroundColor: '#e0f5f1',
                  color: '#00a86b',
                  fontWeight: 700,
                }}
              />
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Locked rows belong to other RAs. You can modify this RA&apos;s assignments.
              </Typography>
            </Box>

            {/* Error Alert */}
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Table */}
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <CircularProgress sx={{ color: '#00a86b' }} />
                </Box>
              ) : filteredData.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Typography color="textSecondary">No territories found</Typography>
                </Box>
              ) : (
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={
                            filteredData.filter((c) => !isDisabledConstituency(c)).length > 0 &&
                            filteredData
                              .filter((c) => !isDisabledConstituency(c))
                              .every((c) => selectedIds.has(c.id))
                          }
                          indeterminate={
                            filteredData.filter((c) => !isDisabledConstituency(c)).some((c) => selectedIds.has(c.id)) &&
                            !filteredData
                              .filter((c) => !isDisabledConstituency(c))
                              .every((c) => selectedIds.has(c.id))
                          }
                          onChange={handleSelectAll}
                          sx={{ color: '#00a86b' }}
                        />
                      </TableCell>
                      {/* <TableCell sx={{ fontWeight: 700 }}>ECI ID</TableCell> */}
                      <TableCell sx={{ fontWeight: 700 }}>ECI Code - Constituency</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Assigned RA</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredData.map((c) => {
                      const disabled = isDisabledConstituency(c);
                      return (
                        <TableRow
                          key={c.id}
                          onClick={() => !disabled && handleToggle(c.id)}
                          sx={{
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            backgroundColor: selectedIds.has(c.id) ? '#e0f5f1' : 'transparent',
                            '&:hover': { backgroundColor: disabled ? 'transparent' : '#f5f5f5' },
                            opacity: disabled ? 0.5 : 1,
                          }}
                        >
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              disabled={disabled}
                              onChange={() => handleToggle(c.id)}
                              sx={{ color: '#00a86b' }}
                            />
                          </TableCell>
                          {/* <TableCell sx={{ fontWeight: 700, color: '#00a86b' }}>{c.eci_id}</TableCell> */}
                          <TableCell>{getConstituencyName(c)}</TableCell>
                          <TableCell>
                            {c.assigned_ra_id
                              ? c.assigned_ra_id === ra.id
                                ? `${ra.name ? `${ra.name} (${ra.email})` : ra.email} (Current RA)`
                                : (
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <LockOutlinedIcon sx={{ fontSize: '1rem', color: '#ef4444' }} />
                                    <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 600 }}>
                                      Locked ({raInfoMap[c.assigned_ra_id]?.display || c.assigned_ra_id})
                                    </Typography>
                                  </Stack>
                                )
                              : 'Unassigned'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          </DialogContent>
        </Box>
      </Box>

      <DialogActions sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
        <Button onClick={onClose} disabled={isSaving} variant="outlined">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="contained"
          sx={{
            background: 'linear-gradient(135deg, #00a86b 0%, #33c292 100%)',
          }}
        >
          {isSaving ? 'Saving...' : 'Save Delegation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}