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

// Create a TanStack Query client for our data fetching
const queryClient = new QueryClient();

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
          <Router>
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<Login />} />
              {/* Protected Routes (We will add strict role guards later) */}
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/tl" element={<TLDashboard />} />
              <Route path="/ra" element={<RADashboard />} />

              {/* Default Route */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
        </Box>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;