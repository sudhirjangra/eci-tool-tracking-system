function getPayloadRecord(payload) {
  const next = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
  return next?.constituency_id ? next : null;
}

function invalidateRecoveryQueries(queryClient, recoveryQueryKeys) {
  if (!queryClient || !Array.isArray(recoveryQueryKeys) || recoveryQueryKeys.length === 0) {
    return;
  }

  Promise.all(
    recoveryQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'active' })),
  ).catch((error) => {
    console.warn('[Realtime] Failed to refresh queries after channel state change', error);
  });
}

export function createBufferedQueryPatchScheduler(queryClient, queryKey, patcher, delay = 150) {
  let pendingByConstituency = new Map();
  let pendingWithoutKey = [];
  let timer = null;

  const flush = () => {
    const batch = [
      ...pendingByConstituency.values(),
      ...pendingWithoutKey,
    ];

    if (!batch.length) {
      timer = null;
      return;
    }

    pendingByConstituency = new Map();
    pendingWithoutKey = [];
    timer = null;

    queryClient.setQueryData(queryKey, (previous) => batch.reduce((rows, payload) => patcher(rows, payload), previous));
  };

  return {
    push(payload) {
      const record = getPayloadRecord(payload);
      if (record?.constituency_id) {
        pendingByConstituency.set(record.constituency_id, payload);
      } else {
        pendingWithoutKey.push(payload);
      }

      if (timer !== null) return;
      timer = setTimeout(flush, delay);
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      flush();
    },
  };
}

export function patchElectionRows(rows, payload) {
  const record = getPayloadRecord(payload);
  if (!record || !Array.isArray(rows)) return rows;

  const index = rows.findIndex((row) => row.constituency_id === record.constituency_id);
  if (index === -1) {
    return [...rows, record];
  }

  const nextRows = [...rows];
  nextRows[index] = {
    ...nextRows[index],
    ...record,
  };
  return nextRows;
}

export function patchNestedElectionRows(rows, payload) {
  const record = getPayloadRecord(payload);
  if (!record || !Array.isArray(rows)) return rows;

  if (!record.eci_round_updated_at && !record.tool_round_updated_at && !record.eci_updated_at) {
    console.debug('[Realtime] payload missing timestamps', {
      constituencyId: record.constituency_id,
      record,
      payloadType: payload?.eventType,
    });
  }

  const index = rows.findIndex((row) => row.id === record.constituency_id);
  if (index === -1) return rows;

  const nextRows = [...rows];
  const existing = nextRows[index];
  nextRows[index] = {
    ...existing,
    election_data: [
      {
        ...(existing.election_data?.[0] || {}),
        ...record,
      },
    ],
  };

  return nextRows;
}

export function patchNestedElectionById(rows, payload, fieldName = 'election') {
  const record = getPayloadRecord(payload);
  if (!record || !Array.isArray(rows)) return rows;

  const index = rows.findIndex((row) => row.id === record.constituency_id);
  if (index === -1) return rows;

  const nextRows = [...rows];
  const existing = nextRows[index];
  nextRows[index] = {
    ...existing,
    [fieldName]: {
      ...(existing[fieldName] || {}),
      ...record,
    },
  };

  return nextRows;
}

export function subscribeToElectionData({
  supabase,
  channelName,
  queryClient,
  recoveryQueryKeys = [],
  onPayload,
  logPrefix = 'Realtime',
}) {
  let hasSubscribedOnce = false;
  let refreshScheduled = false;

  const scheduleRecoveryRefresh = () => {
    if (refreshScheduled) {
      return;
    }

    refreshScheduled = true;
    Promise.resolve().then(() => {
      refreshScheduled = false;
      invalidateRecoveryQueries(queryClient, recoveryQueryKeys);
    });
  };

  return supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'election_data' }, (payload) => {
      try {
        onPayload?.(payload);
      } catch (error) {
        console.error(`[${logPrefix}] Failed to process realtime payload`, error);
        scheduleRecoveryRefresh();
      }
    })
    .subscribe((status, err) => {
      if (err) {
        console.warn(`[${logPrefix}] Real-time subscription error: ${err.message}`);
        scheduleRecoveryRefresh();
        return;
      }

      if (status === 'SUBSCRIBED') {
        console.log(`[${logPrefix}] Real-time subscription active: ${channelName}`);
        if (hasSubscribedOnce) {
          scheduleRecoveryRefresh();
        }
        hasSubscribedOnce = true;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(`[${logPrefix}] Channel state changed: ${status}`);
        scheduleRecoveryRefresh();
      }
    });
}