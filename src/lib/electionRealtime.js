function getPayloadRecord(payload) {
  const next = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
  return next?.constituency_id ? next : null;
}

export function createBufferedQueryPatchScheduler(queryClient, queryKey, patcher, delay = 150) {
  let pending = [];
  let timer = null;

  const flush = () => {
    if (!pending.length) {
      timer = null;
      return;
    }

    const batch = pending;
    pending = [];
    timer = null;

    queryClient.setQueryData(queryKey, (previous) => batch.reduce((rows, payload) => patcher(rows, payload), previous));
  };

  return {
    push(payload) {
      pending.push(payload);
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

  let changed = false;
  const nextRows = rows.map((row) => {
    if (row.id !== record.constituency_id) {
      return row;
    }

    changed = true;
    return {
      ...row,
      election_data: [
        {
          ...(row.election_data?.[0] || {}),
          ...record,
        },
      ],
    };
  });

  return changed ? nextRows : rows;
}

export function patchNestedElectionById(rows, payload, fieldName = 'election') {
  const record = getPayloadRecord(payload);
  if (!record || !Array.isArray(rows)) return rows;

  let changed = false;
  const nextRows = rows.map((row) => {
    if (row.id !== record.constituency_id) {
      return row;
    }

    changed = true;
    return {
      ...row,
      [fieldName]: {
        ...(row[fieldName] || {}),
        ...record,
      },
    };
  });

  return changed ? nextRows : rows;
}