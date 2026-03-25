import { useState } from 'react';
import { supabase, supabaseAdminAuth } from '../../lib/supabase';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  PersonAdd as PersonAddIcon,
  Email as EmailIcon,
  Lock as LockIcon,
} from '@mui/icons-material';

export default function CreateRAModal({ isOpen, onClose, onSuccess, tlId }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleCreateRA = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (!email.trim() || !password.trim() || !name.trim()) {
      setError('Email, name, and password are required.');
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabaseAdminAuth.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData?.user) {
      const { error: roleError } = await supabase.from('user_roles').insert({
        id: authData.user.id,
        role: 'ra',
        manager_id: tlId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
      });

      if (roleError) {
        setError(`Account created, but assigning RA role failed: ${roleError.message}`);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setEmail('');
      setName('');
      setPassword('');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1600);
    }

    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Create Research Analyst</Typography>
            <Typography variant="body2" color="text.secondary">Add a new RA account under your team</Typography>
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
          {success && <Alert severity="success">Research Analyst created successfully.</Alert>}

          <TextField
            label="Full Name"
            type="text"
            required
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            placeholder="Jane Smith"
          />

          <TextField
            label="Email Address"
            type="email"
            required
            fullWidth
            size="small"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon color="action" />
                </InputAdornment>
              ),
            }}
            placeholder="ra.name@election2026.com"
          />

          <TextField
            label="Temporary Password"
            type={showPassword ? 'text' : 'password'}
            required
            fullWidth
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            helperText="Minimum 6 characters"
            inputProps={{ minLength: 6 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={() => setShowPassword((prev) => !prev)}
                    onMouseDown={(event) => event.preventDefault()}
                    size="small"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Temporary password will be used by RA to sign in. They can reset it later.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleCreateRA}
          disabled={loading || success}
          variant="contained"
          startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <PersonAddIcon />}
        >
          {loading ? 'Creating...' : 'Create Research Analyst'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
