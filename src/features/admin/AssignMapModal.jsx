import { useState, useEffect } from 'react';
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
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  CircularProgress,
  Alert,
  Stack,
  InputAdornment,
} from '@mui/material';
import { MapPin, Search } from 'lucide-react';

export default function AssignMapModal({ isOpen, onClose, tl, onSuccess }) {
  const [selectedState, setSelectedState] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const { data: constituencies, isLoading } = useQuery({
    queryKey: ['assignable-constituencies', tl?.id],
    queryFn: async () => {
      if (!tl?.id) return [];
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, eci_id, eci_name, tool_name, states(name), assigned_tl_id`)
        .order('states(name),eci_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tl?.id && isOpen, 
  });

  const states = [...new Set((constituencies || []).map(c => c.states?.name).filter(Boolean))].sort();

  const isDisabledConstituency = (c) => c.assigned_tl_id && c.assigned_tl_id !== tl.id;

  useEffect(() => {
    if (constituencies) {
      const alreadyAssigned = constituencies.filter(c => c.assigned_tl_id === tl.id).map(c => c.id);
      setSelectedIds(new Set(alreadyAssigned));
    }
  }, [constituencies, tl?.id]);

  if (!tl) return null;

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
    const originalIds = new Set(constituencies.filter(c => c.assigned_tl_id === tl.id).map(c => c.id));
    const idsToAssign = [...selectedIds].filter(id => !originalIds.has(id));
    const idsToUnassign = [...originalIds].filter(id => !selectedIds.has(id));

    try {
      if (idsToAssign.length > 0) {
        const { error } = await supabase.from('constituencies').update({ assigned_tl_id: tl.id }).in('id', idsToAssign);
        if (error) throw error;
      }
      if (idsToUnassign.length > 0) {
        const { error } = await supabase.from('constituencies').update({ assigned_tl_id: null }).in('id', idsToUnassign);
        if (error) throw error;
      }
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
    c.eci_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontSize: '1.5rem',
        fontWeight: 700,
      }}>
        <MapPin size={28} />
        Assign Constituencies to Team Leader
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
              Click to filter constituencies
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
                  backgroundColor: selectedState === state ? '#0f4c75' : 'transparent',
                  color: selectedState === state ? 'white' : '#333',
                  '&:hover': {
                    backgroundColor: selectedState === state ? '#0f4c75' : '#e8e8e8',
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

        {/* Right Panel - Constituencies */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
            {/* User Info */}
            <Box sx={{ mb: 2 }}>
              <Chip
                label={`Team Leader: ${tl.email}`}
                color="primary"
                variant="outlined"
                size="small"
              />
            </Box>

            {/* Search Bar */}
            <TextField
              fullWidth
              size="small"
              placeholder={selectedState ? `Search in ${selectedState}...` : 'Search constituencies...'}
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
              >
                {filteredData.length === filteredData.filter(c => selectedIds.has(c.id)).length && filteredData.length > 0 
                  ? 'Deselect All' 
                  : 'Select All'}
              </Button>
              <Chip
                label={`${selectedIds.size} Selected`}
                color="primary"
                variant="outlined"
              />
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
                  <CircularProgress />
                </Box>
              ) : filteredData.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Typography color="textSecondary">No constituencies found</Typography>
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
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ECI ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ECI Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Tool Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Assigned TL</TableCell>
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
                            backgroundColor: selectedIds.has(c.id) ? '#e3f2fd' : 'transparent',
                            '&:hover': { backgroundColor: disabled ? 'transparent' : '#f5f5f5' },
                            opacity: disabled ? 0.5 : 1,
                          }}
                        >
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              disabled={disabled}
                              onChange={() => handleToggle(c.id)}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#0f4c75' }}>{c.eci_id}</TableCell>
                          <TableCell>{c.eci_name}</TableCell>
                          <TableCell>{c.tool_name || '—'}</TableCell>
                          <TableCell>
                            {c.assigned_tl_id
                              ? c.assigned_tl_id === tl.id
                                ? 'Current TL'
                                : c.assigned_tl_id
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
            background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
          }}
        >
          {isSaving ? 'Saving...' : 'Save Assignments'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}