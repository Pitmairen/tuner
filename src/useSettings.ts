import { useCallback, useState } from 'react';

import { readJson, writeJson } from './storage';
import { DEFAULT_A4, MAX_A4, MIN_A4 } from './tuner/notes';
import { DEFAULT_STEADINESS, Steadiness, STEADINESS_OPTIONS } from './tuner/steadiness';
import { MAX_TRANSPOSE, MIN_TRANSPOSE, TUNINGS } from './tuner/tunings';

const FILE_NAME = 'settings.json';

export type Settings = {
  /** May name a custom tuning that has since been deleted; callers fall back. */
  tuningId: string;
  /** Reference pitch in Hz. */
  a4: number;
  /** How much the needle is smoothed. */
  steadiness: Steadiness;
  /** Semitones every string target is shifted (capo / transpose). */
  transpose: number;
};

const DEFAULTS: Settings = { tuningId: TUNINGS[0].id, a4: DEFAULT_A4, steadiness: DEFAULT_STEADINESS, transpose: 0 };

function load(): Settings {
  const stored = readJson(FILE_NAME) as Partial<Record<keyof Settings, unknown>> | null;
  const { a4, transpose } = stored ?? {};
  return {
    tuningId: typeof stored?.tuningId === 'string' ? stored.tuningId : DEFAULTS.tuningId,
    a4: typeof a4 === 'number' && Number.isInteger(a4) && a4 >= MIN_A4 && a4 <= MAX_A4 ? a4 : DEFAULTS.a4,
    steadiness: STEADINESS_OPTIONS.find((o) => o.id === stored?.steadiness)?.id ?? DEFAULTS.steadiness,
    transpose:
      typeof transpose === 'number' &&
      Number.isInteger(transpose) &&
      transpose >= MIN_TRANSPOSE &&
      transpose <= MAX_TRANSPOSE
        ? transpose
        : DEFAULTS.transpose,
  };
}

/** App settings, remembered between launches. */
export function useSettings() {
  const [settings, setSettings] = useState(load);

  const update = useCallback(
    (changes: Partial<Settings>) => {
      const next = { ...settings, ...changes };
      setSettings(next);
      writeJson(FILE_NAME, next);
    },
    [settings],
  );

  return [settings, update] as const;
}
