import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0f4c75', // Deep navy - professional authority
      light: '#2a6fa6',
      dark: '#083057',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#00a86b', // Emerald - team leads
      light: '#33c292',
      dark: '#006d45',
      contrastText: '#ffffff',
    },
    success: {
      main: '#10b981', // Green - success state
      light: '#34d399',
      dark: '#059669',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#f59e0b', // Amber - attention
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: '#ffffff',
    },
    error: {
      main: '#dc2626', // Red - critical
      light: '#ef4444',
      dark: '#b91c1c',
      contrastText: '#ffffff',
    },
    info: {
      main: '#0ea5e9', // Sky blue - information
      light: '#38bdf8',
      dark: '#06b6d4',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f0f4f8',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a202c',
      secondary: '#4a5568',
      disabled: '#a0aec0',
    },
    divider: '#cbd5e0',
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
          background: '#f0f4f8',
          color: '#1a202c',
          transition: 'all 0.3s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          transition: 'all 0.3s ease',
        },
        elevation0: {
          boxShadow: 'none',
          border: '1px solid #cbd5e0',
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
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
          background: 'linear-gradient(135deg, #0f4c75 0%, #2a6fa6 100%)',
          boxShadow: '0 8px 24px rgba(15, 76, 117, 0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #083057 0%, #1e5a8a 100%)',
            boxShadow: '0 12px 32px rgba(15, 76, 117, 0.35)',
          },
        },
        containedSecondary: {
          background: 'linear-gradient(135deg, #00a86b 0%, #33c292 100%)',
          boxShadow: '0 8px 24px rgba(0, 168, 107, 0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #006d45 0%, #199058 100%)',
            boxShadow: '0 12px 32px rgba(0, 168, 107, 0.35)',
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
          borderRadius: '0.875rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.1)',
            transform: 'translateY(-4px)',
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
            backgroundColor: '#f0f4f8',
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#4a5568',
            borderBottom: '2px solid #cbd5e0',
          },
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid #e2e8f0',
            fontSize: '0.875rem',
            color: '#1a202c',
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: '#f7fafc',
            cursor: 'pointer',
          },
          '& .MuiTablePagination-root': {
            backgroundColor: '#f0f4f8',
            borderTop: '1px solid #cbd5e0',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#cbd5e0',
          fontSize: '0.875rem',
          color: '#1a202c',
        },
        head: {
          backgroundColor: '#f0f4f8',
          fontWeight: 700,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#4a5568',
          borderColor: '#cbd5e0',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '0.625rem',
            backgroundColor: '#f7fafc',
            transition: 'all 0.3s ease',
            fontSize: '0.95rem',
            '&:hover': {
              backgroundColor: '#edf2f7',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              boxShadow: '0 0 0 3px rgba(15, 76, 117, 0.1)',
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
          backgroundColor: 'rgba(15, 76, 117, 0.12)',
          color: '#0f4c75',
        },
        filledSecondary: {
          backgroundColor: 'rgba(0, 168, 107, 0.12)',
          color: '#00a86b',
        },
        filledSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          color: '#10b981',
        },
        filledWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          color: '#f59e0b',
        },
        filledError: {
          backgroundColor: 'rgba(220, 38, 38, 0.12)',
          color: '#dc2626',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.08)',
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #cbd5e0',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: '#1a202c',
          color: '#e2e8f0',
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
