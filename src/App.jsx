import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
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
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const queryPersister = typeof window !== 'undefined'
  ? createSyncStoragePersister({
      storage: window.localStorage,
      key: 'election-dashboard-query-cache',
      throttleTime: 1000,
    })
  : null;

function QueryProviders({ children }) {
  if (!queryPersister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 5 * 60 * 1000,
        buster: '2026-04-01-live-cache-v2',
      }}
      onSuccess={() => {
        queryClient.resumePausedMutations().catch(() => undefined);
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryProviders>
        <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/tl" element={<TLDashboard />} />
              <Route path="/ra" element={<RADashboard />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
        </Box>
      </QueryProviders>
    </ThemeProvider>
  );
}

export default App;