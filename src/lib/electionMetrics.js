export const ACTIVITY_THRESHOLD_MS = 60000;

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
  const eciActive = !!eciRoundUpdatedMillis && now - eciRoundUpdatedMillis <= ACTIVITY_THRESHOLD_MS;
  const toolActive = !!toolRoundUpdatedMillis && now - toolRoundUpdatedMillis <= ACTIVITY_THRESHOLD_MS;
  const status = eciActive ? 'Active' : 'Inactive';

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
    return 'In Sync';
  }

  if (delta > 0) {
    return `ECI +${delta}`;
  }

  return `Tool +${Math.abs(delta)}`;
}

export function getConstituencyName(row) {
  const name = row?.tool_name?.trim();
  return name || 'Unmapped';
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