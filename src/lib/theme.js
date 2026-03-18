import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#667eea', // Beautiful purple
      light: '#8b7eee',
      dark: '#5568d3',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#764ba2', // Deep purple
      light: '#8a5bb8',
      dark: '#62378f',
      contrastText: '#ffffff',
    },
    success: {
      main: '#10b981', // Emerald
      light: '#34d399',
      dark: '#059669',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#f59e0b', // Amber
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444', // Red
      light: '#f87171',
      dark: '#dc2626',
      contrastText: '#ffffff',
    },
    info: {
      main: '#3b82f6', // Blue
      light: '#60a5fa',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
      disabled: '#cbd5e1',
    },
    divider: '#e2e8f0',
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '3rem',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2.25rem',
      fontWeight: 750,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.875rem',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 700,
      letterSpacing: '-0.005em',
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 650,
      letterSpacing: '0em',
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.01em',
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '0.95rem',
      lineHeight: 1.6,
      fontWeight: 400,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      fontWeight: 400,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
      fontWeight: 400,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#f8fafc',
          color: '#1e293b',
          transition: 'all 0.3s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
        },
        elevation0: {
          boxShadow: 'none',
          border: '1px solid #e2e8f0',
        },
        elevation1: {
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: '0.5rem',
          padding: '0.625rem 1.25rem',
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
          },
        },
        contained: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          '&:hover': {
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5568d3 0%, #62378f 100%)',
            boxShadow: '0 12px 32px rgba(102, 126, 234, 0.4)',
          },
        },
        outlined: {
          borderColor: '#e2e8f0',
          '&:hover': {
            borderColor: '#cbd5e1',
            backgroundColor: '#f8fafc',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          backgroundColor: '#ffffff',
          '& .MuiDataGrid-columnHeader': {
            backgroundColor: '#f1f5f9',
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#64748b',
            borderBottom: '2px solid #e2e8f0',
          },
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid #e2e8f0',
            fontSize: '0.875rem',
            color: '#1e293b',
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: '#f8fafc',
            cursor: 'pointer',
          },
          '& .MuiTablePagination-root': {
            backgroundColor: '#f1f5f9',
            borderTop: '1px solid #e2e8f0',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#e2e8f0',
          fontSize: '0.875rem',
          color: '#1e293b',
        },
        head: {
          backgroundColor: '#f1f5f9',
          fontWeight: 700,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#64748b',
          borderColor: '#e2e8f0',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '0.625rem',
            backgroundColor: '#f8fafc',
            transition: 'all 0.3s ease',
            fontSize: '0.95rem',
            '&:hover': {
              backgroundColor: '#f1f5f9',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
            },
            '&.Mui-error': {
              backgroundColor: '#fef2f2',
            },
          },
          '& .MuiOutlinedInput-input': {
            fontSize: '0.95rem',
            fontWeight: 500,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderRadius: '0.5rem',
        },
        filledPrimary: {
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          color: '#667eea',
        },
        filledSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          color: '#10b981',
        },
        filledWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          color: '#f59e0b',
        },
        filledError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: '#1e293b',
          color: '#f1f5f9',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: '0.625rem',
          fontWeight: 500,
        },
        standardError: {
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
        },
        standardSuccess: {
          backgroundColor: '#dcfce7',
          color: '#166534',
          border: '1px solid #bbf7d0',
        },
        standardWarning: {
          backgroundColor: '#fef3c7',
          color: '#92400e',
          border: '1px solid #fde68a',
        },
        standardInfo: {
          backgroundColor: '#dbeafe',
          color: '#1e40af',
          border: '1px solid #bfdbfe',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: '1rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#e2e8f0',
          margin: '1.5rem 0',
        },
      },
    },
  },
});

export default theme;
