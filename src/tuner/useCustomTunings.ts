import { useCallback, useState } from 'react';

import { readJson, writeJson } from '../storage';
import { parseNote } from './notes';
import { INSTRUMENTS, Tuning } from './tunings';

const MIN_STRINGS = 4;
const MAX_STRINGS = 6;
const FILE_NAME = 'custom-tunings.json';

function load(): Tuning[] {
  const parsed = readJson(FILE_NAME);
  if (!Array.isArray(parsed)) return [];
  // Tunings saved before other instruments existed have no instrument: guitar.
  return parsed
    .map((t) => (isObject(t) && t.instrument == null ? { ...t, instrument: 'guitar' } : t))
    .filter(isValidTuning);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

/** Drops anything malformed so a bad file can never crash the tuner. */
function isValidTuning(value: unknown): value is Tuning {
  if (!isObject(value)) return false;
  const { id, name, notes, instrument } = value as Partial<Tuning>;
  if (typeof id !== 'string' || typeof name !== 'string') return false;
  if (!INSTRUMENTS.some((i) => i.id === instrument)) return false;
  if (!Array.isArray(notes) || notes.length < MIN_STRINGS || notes.length > MAX_STRINGS) return false;
  return notes.every((note) => {
    try {
      parseNote(note);
      return true;
    } catch {
      return false;
    }
  });
}

/** User-created tunings, persisted to a JSON file in the app's documents. */
export function useCustomTunings() {
  const [tunings, setTunings] = useState(load);

  const update = useCallback((next: Tuning[]) => {
    setTunings(next);
    writeJson(FILE_NAME, next);
  }, []);

  const save = useCallback(
    (tuning: Tuning) => {
      const exists = tunings.some((t) => t.id === tuning.id);
      update(exists ? tunings.map((t) => (t.id === tuning.id ? tuning : t)) : [...tunings, tuning]);
    },
    [tunings, update],
  );

  const remove = useCallback((id: string) => update(tunings.filter((t) => t.id !== id)), [tunings, update]);

  return { tunings, save, remove };
}
