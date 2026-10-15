import { useCallback, useState } from 'react';

import { readJson, writeJson } from '../storage';
import { parseNote } from './notes';
import { Tuning } from './tunings';

const STRING_COUNT = 6;
const FILE_NAME = 'custom-tunings.json';

function load(): Tuning[] {
  const parsed = readJson(FILE_NAME);
  return Array.isArray(parsed) ? parsed.filter(isValidTuning) : [];
}

/** Drops anything malformed so a bad file can never crash the tuner. */
function isValidTuning(value: unknown): value is Tuning {
  if (typeof value !== 'object' || value == null) return false;
  const { id, name, notes } = value as Partial<Tuning>;
  if (typeof id !== 'string' || typeof name !== 'string') return false;
  if (!Array.isArray(notes) || notes.length !== STRING_COUNT) return false;
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
