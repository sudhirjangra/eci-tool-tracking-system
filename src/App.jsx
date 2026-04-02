import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import theme from './lib/theme';
import Login from './features/auth/Login';
import AdminDashboard from './features/admin/AdminDashboard';
import RADashboard from './features/ra/RADashboard';
import TLDashboard from './features/tl/TLDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
    },
  },
});

export { queryClient };

function QueryProviders({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(error) {
    // Only catch actual errors, not concurrent rendering recovery warnings
    if (error?.message?.includes('concurrent rendering')) {
      console.warn('[ErrorBoundary] Suppressing concurrent rendering recovery warning', error);
      return null;
    }
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Ignore transient React concurrent rendering errors
    if (error?.message?.includes('concurrent rendering')) {
      return;
    }
    console.error('[ErrorBoundary]', error, info);
    this.setState(state => ({ errorCount: state.errorCount + 1 }));
  }

  render() {
    if (this.state.hasError) {
      // Auto-recover after a brief delay
      if (this.state.errorCount < 3) {
        setTimeout(() => this.setState({ hasError: false }), 500);
      }
      return <Navigate to="/login" replace />;
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryProviders>
        <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
          <Router>
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/tl" element={<TLDashboard />} />
                <Route path="/ra" element={<RADashboard />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </ErrorBoundary>
          </Router>
        </Box>
      </QueryProviders>
    </ThemeProvider>
  );
}

export default App;