export const dashboardShellSx = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  height: '100vh',
  width: '100%',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #f6fbff 0%, #eef4f8 52%, #f8fbfd 100%)',
  position: 'relative',
};

export const dashboardHeaderSx = {
  background: 'linear-gradient(135deg, #3f3f3f 15%, #57416d 55%, #480c7f 85%)',
  color: '#fff',
  borderBottom: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 10px 30px rgba(15, 76, 117, 0.18)',
  position: 'relative',
  overflow: 'hidden',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 32%, transparent 68%, rgba(255,255,255,0.08))',
    pointerEvents: 'none',
  },
};

export const dashboardContentSx = {
  flexGrow: 1,
  minHeight: 0,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

export const dashboardIntroSx = {
  mb: 1,
  px: 0.5,
};

export const dashboardFilterBarSx = {
  p: 1.5,
  display: 'flex',
  gap: 1.25,
  alignItems: 'center',
  flexWrap: 'wrap',
  background: 'rgba(248, 250, 252, 0.92)',
  borderBottom: '1px solid #e2e8f0',
};

export const dashboardTableCardSx = {
  bgcolor: 'rgba(255, 255, 255, 0.92)',
  border: '1px solid rgba(203, 213, 225, 0.9)',
  borderRadius: '14 px',
  overflow: 'hidden',
  boxShadow: '0 12px 30px rgba(15,76,117,0.08)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

export const dashboardTableHeadCellSx = {
  fontWeight: 700,
  textTransform: 'uppercase',
  fontSize: '0.72rem',
  color: '#64748b',
  py: 1.2,
  letterSpacing: '0.06em',
  backgroundColor: '#f8fafc',
};

export const dashboardTableRowSx = {
  '&:hover': {
    bgcolor: '#f8fafc',
    transform: 'translateY(-1px)',
    boxShadow: 'inset 0 0 0 1px rgba(15, 76, 117, 0.08)',
  },
  transition: 'background-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
  borderBottom: '1px solid #e2e8f0',
};

export const dashboardControlSx = {
  minWidth: 170,
  '& .MuiOutlinedInput-root': {
    bgcolor: '#f8fafc',
    borderRadius: '10px',
  },
};

export const dashboardSearchSx = {
  minWidth: 240,
  '& .MuiOutlinedInput-root': {
    bgcolor: '#f8fafc',
    borderRadius: '10px',
  },
};

export const liveBadgeSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  px: 2,
  py: 0.9,
  backgroundColor: '#e0f2fe',
  border: '1px solid #7dd3fc',
  borderRadius: '999px',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#0c4a6e',
  boxShadow: '0 6px 16px rgba(14, 165, 233, 0.12)',
};

export function getLagPalette(seconds) {
  if (seconds === null || seconds === undefined || seconds === '-') {
    return { bgcolor: 'transparent', color: '#475569' };
  }

  if (seconds <= 60) return { bgcolor: 'rgba(209, 250, 229, 0.4)', color: '#047857' };
  if (seconds <= 300) return { bgcolor: 'rgba(254, 243, 199, 0.4)', color: '#78350f' };
  return { bgcolor: 'rgba(254, 226, 226, 0.4)', color: '#7f1d1d' };
}

export function getStatusPalette(status) {
  if (status === 'Active') return { bgcolor: 'rgba(209, 250, 229, 0.3)', color: '#047857', border: 'none' };
  if (status === 'Inactive') return { bgcolor: 'rgba(254, 226, 226, 0.3)', color: '#7f1d1d', border: 'none' };
  return { bgcolor: 'rgba(226, 232, 240, 0.3)', color: '#475569', border: 'none' };
}

export function getSyncStatusPalette(syncStatus) {
  if (syncStatus === 'ECI = TOOL') return { backgroundColor: 'rgba(209, 250, 229, 0.4)', color: '#047857' };
  if (syncStatus === 'Not Started') return { backgroundColor: 'rgba(226, 232, 240, 0.3)', color: '#475569' };
  if (syncStatus === 'ECI > TOOL') return { backgroundColor: 'rgba(254, 226, 226, 0.4)', color: '#7f1d1d' };
  return { backgroundColor: 'rgba(254, 243, 199, 0.4)', color: '#78350f' };
}

export function getSortLabel(sortBy) {
  if (sortBy === 'lag-asc') return 'Lowest ECI Lag';
  if (sortBy === 'round-diff') return 'Round Difference';
  return 'Highest ECI Lag';
}