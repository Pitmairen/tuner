import { useCallback, useState } from 'react';

import { readJson, writeJson } from '../storage';

const FILE_NAME = 'settings.json';

function load(fallback: string): string {
  const settings = readJson(FILE_NAME) as { tuningId?: unknown } | null;
  return typeof settings?.tuningId === 'string' ? settings.tuningId : fallback;
}

/**
 * The selected tuning's id, remembered between launches. A remembered id that
 * no longer exists (a deleted custom tuning) is the caller's to fall back from.
 */
export function useLastTuningId(fallback: string) {
  const [tuningId, setTuningId] = useState(() => load(fallback));

  const select = useCallback((id: string) => {
    setTuningId(id);
    writeJson(FILE_NAME, { tuningId: id });
  }, []);

  return [tuningId, select] as const;
}
