import React, { useState, useEffect } from 'react';
import { TableRow, TableCell, IconButton, Collapse, Box, Typography, CircularProgress } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { supabase } from '../../lib/supabase';

export default function ExpandableRATableRow({ ra, managerEmail }) {
  const [open, setOpen] = useState(false);
  const [constituencies, setConstituencies] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && constituencies.length === 0 && ra.id) {
      setLoading(true);
      supabase
        .from('constituencies')
        .select('eci_name, states(name)')
        .eq('assigned_ra_id', ra.id)
        .then(({ data }) => {
          setConstituencies(data || []);
          setLoading(false);
        });
    }
  }, [open, ra.id, constituencies.length]);

  return (
    <>
      <TableRow>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(o => !o)}>
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          {ra.email}
        </TableCell>
        <TableCell>{ra.role}</TableCell>
        <TableCell>{managerEmail}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={3} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: '#f8fafc' }}>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>RA ID: {ra.id}</Typography>
              <Typography variant="subtitle2" sx={{ color: '#0f4c75', mb: 1 }}>Assigned Constituencies:</Typography>
              {loading ? (
                <CircularProgress size={20} />
              ) : constituencies.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {constituencies.map((c, idx) => (
                    <li key={idx}>
                      {c.eci_name} {c.states?.name ? `(${c.states.name})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <Typography variant="body2" sx={{ color: '#94a3b8' }}>No constituencies assigned.</Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
