export const ACTIVITY_THRESHOLD_MS = 100000;

export function toMillis(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function getLagSeconds(value, now = Date.now()) {
  const millis = toMillis(value);
  if (!millis) return null;
  return Math.max(0, Math.floor((now - millis) / 1000));
}

export function formatLag(seconds) {
  if (seconds === null || seconds === undefined) return '--';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatTimestamp(value) {
  const millis = toMillis(value);
  if (!millis) return '--';
  return new Date(millis).toLocaleString();
}

export function getActivityFlags(eciRoundUpdatedAt, toolRoundUpdatedAt, now = Date.now()) {
  const eciRoundUpdatedMillis = toMillis(eciRoundUpdatedAt);
  const toolRoundUpdatedMillis = toMillis(toolRoundUpdatedAt);
  if (!eciRoundUpdatedMillis && !toolRoundUpdatedMillis) {
    console.debug('[Metrics] activity timestamps missing', {
      eciRoundUpdatedAt,
      toolRoundUpdatedAt,
      now,
    });
  }
  const eciActive = !!eciRoundUpdatedMillis && now - eciRoundUpdatedMillis <= ACTIVITY_THRESHOLD_MS;
  const toolActive = !!toolRoundUpdatedMillis && now - toolRoundUpdatedMillis <= ACTIVITY_THRESHOLD_MS;
  // Status is Active only when BOTH ECI and TOOL are active
  const status = eciActive && toolActive ? 'Active' : 'Inactive';

  return {
    eciActive,
    toolActive,
    status,
  };
}

export function getSyncStatus(eciRound = 0, toolRound = 0) {
  const delta = eciRound - toolRound;

  if (eciRound === 0 && toolRound === 0) {
    return 'Not Started';
  }

  if (delta === 0) {
    return 'ECI = TOOL';
  }

  if (delta > 0) {
    return 'ECI > TOOL';
  }

  return 'ECI < TOOL';
}

export function getSyncStatusDelta(eciRound = 0, toolRound = 0) {
  return eciRound - toolRound;
}

export function getConstituencyName(row) {
  const name = row?.tool_name?.trim();
  const eciId = row?.eci_id;

  if (!name) {
    return eciId ? `${eciId} - Unmapped` : 'Unmapped';
  }

  return eciId ? `${eciId} - ${name}` : name;
}

export function compareConstituencyNames(left = '', right = '') {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function compareRoundDifference(leftDelta = 0, rightDelta = 0) {
  const deltaGap = Math.abs(rightDelta) - Math.abs(leftDelta);
  if (deltaGap !== 0) return deltaGap;

  const signedGap = rightDelta - leftDelta;
  if (signedGap !== 0) return signedGap;

  return 0;
}

export function getLagBucket(seconds) {
  if (seconds === null || seconds === undefined) return 'Unknown';
  if (seconds <= 60) return 'Fresh';
  if (seconds <= 300) return 'Aging';
  return 'Stale';
}

export function getSortTimestamp(value) {
  return toMillis(value) || 0;
}

function getElectionFreshness(row) {
  if (!row) return 0;
  return Math.max(
    toMillis(row.eci_round_updated_at) || 0,
    toMillis(row.tool_round_updated_at) || 0,
    toMillis(row.eci_updated_at) || 0,
  );
}

export function pickLatestElectionRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  if (rows.length > 1) {
    console.debug('[Metrics] pickLatestElectionRow', {
      count: rows.length,
      rows,
    });
  }

  return rows.reduce((latest, current) => {
    if (!latest) return current;

    const latestFreshness = getElectionFreshness(latest);
    const currentFreshness = getElectionFreshness(current);
    if (currentFreshness !== latestFreshness) {
      return currentFreshness > latestFreshness ? current : latest;
    }

    const latestRoundTotal = (latest.eci_round || 0) + (latest.tool_round || 0);
    const currentRoundTotal = (current.eci_round || 0) + (current.tool_round || 0);
    return currentRoundTotal > latestRoundTotal ? current : latest;
  }, null);
}