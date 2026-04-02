import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Stack,
  Card,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  HowToVote as VotingIcon,
} from '@mui/icons-material';
import { Bold } from 'lucide-react';

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

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      const userRole = roleData?.role || 'ra';

      if (userRole === 'admin') navigate('/admin');
      else if (userRole === 'tl') navigate('/tl');
      else navigate('/ra');

      setLoading(false);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Left Side - Background Image */}
      <Box
        sx={{
          flex: 1,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          padding: '2rem',
          position: 'relative',
          overflow: 'hidden',
          '@media (max-width: 960px)': {
            display: 'none',
          },
        }}
      >
        {/* Background image */}
        <Box
          component="img"
          src="/election-1.png"
          alt="Elections 2026"
          sx={{
          position:'relative',
            width: '75%',
            height: 'auto',
            objectFit: 'cover',
            objectPosition: 'center',
            opacity: 1,
            top: 0,
            left: 0,
            transform: 'none',
          }}
        />
        
      </Box>

      {/* Right Side - Login Form */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem',
          backgroundColor: '#ffffff',
          '@media (max-width: 960px)': {
            flex: 1,
            backgroundColor: 'white',
          },
        }}
      >
        {/* Title Above Form */}
        

        <Card sx={{ width: '100%', maxWidth: '420px', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <Box sx={{ mb: 4, textAlign: 'center', width: '100%', maxWidth: '420px' }}>
  
          <img 
            src="/kantar-logo.png" 
            alt="Elections 2026" 
            style={{ width: '45%', height: 'auto', display: 'block', margin: '3rem auto -2rem auto' }}
          />
        </Box>

          <Box sx={{ padding: '2rem' }}>
            <form onSubmit={handleLogin}>
              <Stack spacing={2.5}>
                {error && <Alert severity="error">{error}</Alert>}

                <div>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, mb: 0.75 }}>
                    Email Address
                  </Typography>
                  <TextField
                    fullWidth
                    type="email"
                    placeholder="sudhirjangra@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: <EmailIcon sx={{ mr: 1.5, color: '#0f4c75' }} />,
                    }}
                  />
                </div>

                <div>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, mb: 0.75 }}>
                    Password
                  </Typography>
                  <TextField
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: <LockIcon sx={{ mr: 1.5, color: '#0f4c75' }} />,
                      endAdornment: (
                        <Box
                          onClick={() => setShowPassword(!showPassword)}
                          sx={{ cursor: 'pointer', color: '#4a5568' }}
                        >
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </Box>
                      ),
                    }}
                  />
                </div>

                {loading && <LinearProgress />}

                <Button
                  type="submit"
                  fullWidth
                  disabled={loading || !email || !password}
                  sx={{
                    background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
                    color: 'white',
                    padding: '0.875rem',
                    fontWeight: 700,
                    borderRadius: '0.75rem',
                    textTransform: 'none',
                  }}
                >
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={20} color="inherit" />
                      Signing in...
                    </Box>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <Box sx={{ textAlign: 'center', mt: 2, pt: 2, borderTop: '1px solid #cbd5e0' }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#4a5568' }}>
                    For assistance, please contact Sudhir Jangra
                  </Typography>
                </Box>
              </Stack>
            </form>
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
