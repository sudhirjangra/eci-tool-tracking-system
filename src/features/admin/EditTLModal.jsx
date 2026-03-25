import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
} from '@mui/icons-material';

export default function EditTLModal({ isOpen, onClose, onSuccess, tl }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && tl) {
      setName(tl.name || '');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, tl]);

  const handleEditTL = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError('Full name is required.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('user_roles')
        .update({ name: name.trim() })
        .eq('id', tl.id);

      if (updateError) {
        setError(`Failed to update: ${updateError.message}`);
        setLoading(false);
        return;
      }

      setSuccess(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1600);
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Edit Team Leader</Typography>
            <Typography variant="body2" color="text.secondary">Update team leader information</Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">Team Leader updated successfully.</Alert>}

          <TextField
            label="Full Name"
            type="text"
            required
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            placeholder="John Doe"
          />

          <Typography variant="body2" color="text.secondary">
            Email: <strong>{tl?.email || 'N/A'}</strong>
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Email updates are not available in this interface. Contact support to change the email address.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleEditTL}
          disabled={loading || success}
          variant="contained"
          startIcon={loading ? <CircularProgress color="inherit" size={18} /> : null}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
