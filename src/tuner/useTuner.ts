import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';

import { centsBetween, frequencyToMidi, midiToFrequency, noteName } from './notes';
import { detectionFor, instrument, Tuning, TuningString, tuningStrings, WIDE_DETECTION } from './tunings';
import { Steadiness } from './steadiness';
import { usePitch } from './usePitch';

export const IN_TUNE_CENTS = 5;
/** Wider than IN_TUNE_CENTS so a reading hovering at the edge doesn't flicker the ✓. */
const OUT_OF_TUNE_CENTS = 10;
/** How long a string must stay in (or out of) tune before its ✓ changes. */
const HOLD_MS = 500;
const NO_STRINGS = new Set<number>();

export type TunerReading = {
  frequency: number;
  /** The note being tuned to: a string of the tuning, or in chromatic mode the nearest note. */
  target: TuningString;
  /** The nearest note to what is actually being played, e.g. "E3". */
  playing: string;
  /** Index into the tuning's strings of the target, or null in chromatic mode. */
  stringIndex: number | null;
  /** Offset from the target. Positive means sharp. */
  cents: number;
};

type Options = {
  tuning: Tuning;
  /** Target the nearest semitone of any pitch instead of the tuning's strings. */
  chromatic: boolean;
  /** Force this string as the target; null picks the nearest automatically. */
  lockedString: number | null;
  a4: number;
  /** Semitones to shift every string's target (capo / transpose). Ignored in chromatic mode. */
  transpose: number;
  /** While true, nothing is detected. */
  muted: boolean;
  steadiness: Steadiness;
};

/** Combines live pitch with the selected tuning (or chromatic mode). */
export function useTuner({ tuning, chromatic, lockedString, a4, transpose, muted, steadiness }: Options) {
  const strings = useMemo(() => tuningStrings(tuning, a4, transpose), [tuning, a4, transpose]);
  // Chromatic mode can't know the instrument, so it listens across the widest range.
  const detection = useMemo(
    () => (chromatic ? WIDE_DETECTION : detectionFor(instrument(tuning.instrument).detection, strings)),
    [chromatic, tuning.instrument, strings],
  );
  const { frequency, permission, retry } = usePitch(muted, detection, steadiness);
  // Keyed by tuning (including its notes, since custom tunings can be edited)
  // so switching or editing starts with nothing checked off.
  const tuningKey = `${tuning.id}:${tuning.notes.join(',')}@${a4}${transpose >= 0 ? '+' : ''}${transpose}`;
  const [tuned, setTuned] = useState({ tuningKey, strings: new Set<number>() });
  const tunedStrings = tuned.tuningKey === tuningKey ? tuned.strings : NO_STRINGS;
  const pending = useRef<{ stringIndex: number; tuned: boolean; since: number } | null>(null);

  const reading = useMemo<TunerReading | null>(() => {
    if (frequency == null) return null;
    const midi = Math.round(frequencyToMidi(frequency, a4));
    const { name, octave } = noteName(midi);
    const playing = `${name}${octave}`;
    if (chromatic) {
      const target = { note: playing, midi, frequency: midiToFrequency(midi, a4) };
      return { frequency, target, playing, stringIndex: null, cents: centsBetween(frequency, target.frequency) };
    }
    const stringIndex = lockedString ?? nearestString(strings, frequency);
    const target = strings[stringIndex];
    return { frequency, target, playing, stringIndex, cents: centsBetween(frequency, target.frequency) };
  }, [frequency, chromatic, lockedString, strings, a4]);

  useEffect(() => {
    // ✓ badges belong to strings, so chromatic mode has none.
    if (!reading || reading.stringIndex == null) {
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
