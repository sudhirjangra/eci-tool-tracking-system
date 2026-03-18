import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Card,
  CardContent,
  Stack,
  InputAdornment,
  CircularProgress,
  Link,
  Grid,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  EastRounded as ArrowIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Fetch the user's role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    const userRole = roleData?.role || 'ra';

    // 3. Redirect based on role
    if (userRole === 'admin') navigate('/admin');
    else if (userRole === 'tl') navigate('/tl');
    else navigate('/ra');

    setLoading(false);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        display: 'flex',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      {/* Animated Background Elements */}
      <Box
        sx={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          top: -100,
          left: -100,
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          bottom: -50,
          right: -50,
          filter: 'blur(40px)',
        }}
      />

      {/* Left Side - Branding & Features */}
      <Box
        sx={{
          flex: 1,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          px: 8,
          py: 4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box sx={{ color: '#ffffff', maxWidth: 500 }}>
          {/* Logo & Title */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5, mb: 3 }}>
            <Avatar
              sx={{
                width: 50,
                height: 50,
                bgcolor: '#ffffff',
                color: '#667eea',
                fontWeight: 'bold',
                fontSize: '1.3rem',
                flexShrink: 0,
                mt: 0.5,
              }}
            >
              ⚡
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 900, letterSpacing: '-1px', fontSize: '1.6rem', lineHeight: 1 }}>
                ELECTION
              </Typography>
              <Typography sx={{ fontWeight: 300, letterSpacing: '2px', mt: 0.2, fontSize: '0.8rem', lineHeight: 1 }}>
                TRACKER 2026
              </Typography>
            </Box>
          </Box>

          {/* Subtitle */}
          <Typography sx={{ fontWeight: 300, mb: 3, lineHeight: 1.6, fontSize: '0.95rem' }}>
            Real-time monitoring for India's democratic process
          </Typography>

          {/* Features List */}
          {/* <Stack spacing={1.8}>
            {[
              { icon: '🗳️', title: 'Live Monitoring', desc: 'Real-time election data tracking' },
              { icon: '👥', title: 'Team Management', desc: 'Seamless coordination & delegation' },
              { icon: '📊', title: 'Analytics', desc: 'Comprehensive reporting & insights' },
            ].map((feature, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ fontSize: '1.3rem', mt: 0.2, flexShrink: 0 }}>{feature.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, mb: 0.2, fontSize: '0.9rem', lineHeight: 1 }}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 300, fontSize: '0.8rem', lineHeight: 1.3 }}>
                    {feature.desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack> */}

          {/* Footer Text */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 3.5,
              opacity: 0.8,
              fontWeight: 300,
              fontSize: '0.75rem',
              lineHeight: 1,
            }}
          >
            Secure. Reliable. Transparent.
          </Typography>
        </Box>
      </Box>

      {/* Right Side - Login Form */}
      <Box
        sx={{
          flex: { xs: 1, md: 0.8 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          px: { xs: 2, sm: 4, md: 6 },
          py: 4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Paper
          elevation={24}
          sx={{
            borderRadius: '20px',
            p: { xs: 3, sm: 4 },
            background: '#ffffff',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            width: '100%',
            maxWidth: 450,
          }}
        >
          {/* Form Header */}
          <Box sx={{ mb: 4 }}>
            <Typography
              sx={{
                fontWeight: 800,
                color: '#1e293b',
                mb: 0.8,
                letterSpacing: '-0.5px',
                fontSize: '1.75rem',
              }}
            >
              Welcome Back
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>
              Sign in to your account to continue
            </Typography>
          </Box>

          <form onSubmit={handleLogin}>
            {/* Error Alert */}
            {error && (
              <Alert
                severity="error"
                icon={<CheckCircleIcon />}
                sx={{
                  mb: 3,
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #fecaca',
                }}
              >
                {error}
              </Alert>
            )}

            {/* Email Field */}
            <Stack spacing={0.8} sx={{ mb: 2 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: '#1e293b',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  letterSpacing: '0.05em',
                }}
              >
                Email Address
              </Typography>
              <TextField
                fullWidth
                type="email"
                placeholder="admin@election2026.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon sx={{ color: '#94a3b8', fontSize: '1.25rem' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    background: '#f8fafc',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    transition: 'all 0.3s ease',
                    height: '40px',
                    '&:hover': {
                      background: '#f1f5f9',
                    },
                    '&.Mui-focused': {
                      background: '#ffffff',
                      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
                    },
                  },
                  '& .MuiOutlinedInput-input': {
                    '&::selection': {
                      background: 'rgba(102, 126, 234, 0.2)',
                      color: 'inherit',
                    },
                  },
                  '& .MuiOutlinedInput-input::placeholder': {
                    color: '#cbd5e1',
                    opacity: 0.8,
                  },
                }}
              />
            </Stack>

            {/* Password Field */}
            <Stack spacing={0.8} sx={{ mb: 2.5 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: '#1e293b',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  letterSpacing: '0.05em',
                }}
              >
                Password
              </Typography>
              <TextField
                fullWidth
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: '#94a3b8', fontSize: '1.25rem' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        onClick={() => setShowPassword(!showPassword)}
                        onMouseDown={(e) => e.preventDefault()}
                        variant="text"
                        sx={{
                          minWidth: 'auto',
                          p: 0.3,
                          color: '#94a3b8',
                          '&:hover': { color: '#667eea', background: 'transparent' },
                        }}
                      >
                        {showPassword ? (
                          <VisibilityOffIcon sx={{ fontSize: '1.25rem' }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: '1.25rem' }} />
                        )}
                      </Button>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    background: '#f8fafc',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    transition: 'all 0.3s ease',
                    height: '40px',
                    '&:hover': {
                      background: '#f1f5f9',
                    },
                    '&.Mui-focused': {
                      background: '#ffffff',
                      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
                    },
                  },
                  '& .MuiOutlinedInput-input': {
                    '&::selection': {
                      background: 'rgba(102, 126, 234, 0.2)',
                      color: 'inherit',
                    },
                  },
                  '& .MuiOutlinedInput-input::placeholder': {
                    color: '#cbd5e1',
                    opacity: 0.8,
                  },
                }}
              />
            </Stack>

            {/* Sign In Button */}
            <Button
              type="submit"
              fullWidth
              disabled={loading}
              sx={{
                py: 1.4,
                mb: 2,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                letterSpacing: '0.5px',
                borderRadius: '10px',
                textTransform: 'uppercase',
                boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                transition: 'all 0.3s ease',
                '&:hover:not(:disabled)': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 32px rgba(102, 126, 234, 0.5)',
                },
                '&:disabled': {
                  opacity: 0.6,
                },
              }}
            >
              {loading ? (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} sx={{ color: '#ffffff' }} />
                  <span>Signing in...</span>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                  <span>Sign In</span>
                  <ArrowIcon sx={{ fontSize: '1.2rem' }} />
                </Stack>
              )}
            </Button>

            {/* Divider */}
            <Divider sx={{ my: 2 }} />

            {/* Footer Text */}
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'center',
                color: '#64748b',
                fontWeight: 400,
                lineHeight: 1.5,
                fontSize: '0.8rem',
              }}
            >
              Need assistance?{' '}
              <Link
                href="mailto:sudhir.jangra@kantar.com"
                sx={{
                  color: '#667eea',
                  textDecoration: 'none',
                  fontWeight: 600,
                  transition: 'color 0.2s ease',
                  '&:hover': { color: '#764ba2' },
                }}
              >
                Contact Support
              </Link>
            </Typography>
          </form>
        </Paper>

        {/* Security Badge */}
        <Box sx={{ mt: 3, textAlign: 'center', color: '#ffffff' }}>
          <Typography variant="caption" sx={{ fontWeight: 300, opacity: 0.8 }}>
            🔒 End-to-end encrypted • Developed by Sudhir Jangra
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}