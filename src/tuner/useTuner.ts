import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';

import { centsBetween, frequencyToMidi, noteName } from './notes';
import { Tuning, tuningStrings } from './tunings';
import { usePitch } from './usePitch';

export const IN_TUNE_CENTS = 5;
/** Wider than IN_TUNE_CENTS so a reading hovering at the edge doesn't flicker the ✓. */
const OUT_OF_TUNE_CENTS = 10;
/** How long a string must stay in (or out of) tune before its ✓ changes. */
const HOLD_MS = 500;
const NO_STRINGS = new Set<number>();

export type TunerReading = {
  frequency: number;
  /** The nearest chromatic note, independent of the tuning. */
  detected: { name: string; octave: number };
  /** Index into the tuning's strings of the string being tuned. */
  stringIndex: number;
  /** Offset from the target string. Positive means sharp. */
  cents: number;
};

/**
 * Combines live pitch with the selected tuning. With `lockedString` null the
 * nearest string is picked automatically. While `muted`, nothing is detected.
 */
export function useTuner(tuning: Tuning, lockedString: number | null, a4: number, muted = false) {
  const { frequency, permission, retry } = usePitch(muted);
  const strings = useMemo(() => tuningStrings(tuning, a4), [tuning, a4]);
  // Keyed by tuning (including its notes, since custom tunings can be edited)
  // so switching or editing starts with nothing checked off.
  const tuningKey = `${tuning.id}:${tuning.notes.join(',')}@${a4}`;
  const [tuned, setTuned] = useState({ tuningKey, strings: new Set<number>() });
  const tunedStrings = tuned.tuningKey === tuningKey ? tuned.strings : NO_STRINGS;
  const pending = useRef<{ stringIndex: number; tuned: boolean; since: number } | null>(null);

  const reading = useMemo<TunerReading | null>(() => {
    if (frequency == null) return null;
    const stringIndex = lockedString ?? nearestString(strings, frequency);
    return {
      frequency,
      detected: noteName(frequencyToMidi(frequency, a4)),
      stringIndex,
      cents: centsBetween(frequency, strings[stringIndex].frequency),
    };
  }, [frequency, lockedString, strings, a4]);

  useEffect(() => {
    if (!reading) {
      pending.current = null;
      return;
    }
    const { stringIndex } = reading;
    const cents = Math.abs(reading.cents);
    const shouldBeTuned = cents <= IN_TUNE_CENTS ? true : cents > OUT_OF_TUNE_CENTS ? false : null;
    if (shouldBeTuned == null || shouldBeTuned === tunedStrings.has(stringIndex)) {
      pending.current = null;
      return;
    }

    const now = Date.now();
    const p = pending.current;
    if (!p || p.stringIndex !== stringIndex || p.tuned !== shouldBeTuned) {
      pending.current = { stringIndex, tuned: shouldBeTuned, since: now };
      return;
    }
    if (now - p.since < HOLD_MS) return;

    pending.current = null;
    const next = new Set(tunedStrings);
    if (shouldBeTuned) {
      next.add(stringIndex);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      next.delete(stringIndex);
    }
    setTuned({ tuningKey, strings: next });
  }, [reading, tunedStrings, tuningKey]);

  return { reading, strings, tunedStrings, permission, retry };
}

function nearestString(strings: { frequency: number }[], frequency: number): number {
  let best = 0;
  for (let i = 1; i < strings.length; i++) {
    if (Math.abs(centsBetween(frequency, strings[i].frequency)) < Math.abs(centsBetween(frequency, strings[best].frequency))) {
      best = i;
    }
  }
  return best;
}
