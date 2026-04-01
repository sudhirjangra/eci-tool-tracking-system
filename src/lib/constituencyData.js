import { pickLatestElectionRow } from './electionMetrics';
import { supabase } from './supabase';

const ELECTION_DATA_SELECT = `
  constituency_id,
  eci_round,
  tool_round,
  eci_round_updated_at,
  tool_round_updated_at,
  eci_updated_at
`;

export async function fetchConstituenciesWithElectionData({ selectClause, buildConstituencyQuery }) {
  const baseQuery = supabase.from('constituencies').select(selectClause);
  const query = buildConstituencyQuery ? buildConstituencyQuery(baseQuery) : baseQuery;

  const { data: constituencies, error: constituencyError } = await query;
  if (constituencyError) throw constituencyError;

  const rows = constituencies || [];
  if (rows.length === 0) {
    return [];
  }

  const constituencyIds = rows.map((row) => row.id);
  const { data: electionRows, error: electionError } = await supabase
    .from('election_data')
    .select(ELECTION_DATA_SELECT)
    .in('constituency_id', constituencyIds);

  if (electionError) throw electionError;

  const electionByConstituencyId = new Map();
  for (const electionRow of electionRows || []) {
    const existingRows = electionByConstituencyId.get(electionRow.constituency_id) || [];
    existingRows.push(electionRow);
    electionByConstituencyId.set(electionRow.constituency_id, existingRows);
  }

  return rows.map((row) => ({
    ...row,
    election_data: electionByConstituencyId.has(row.id)
      ? [pickLatestElectionRow(electionByConstituencyId.get(row.id))].filter(Boolean)
      : [],
  }));
}