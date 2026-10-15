export const A4 = 440;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToFrequency(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / A4);
}

/** Cents between `freq` and `reference`. Positive means `freq` is sharp. */
export function centsBetween(freq: number, reference: number): number {
  return 1200 * Math.log2(freq / reference);
}

/** Parses scientific pitch notation such as "E2", "F#3" or "Bb3" into a MIDI note number. */
export function parseNote(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Invalid note: ${note}`);
  const [, letter, accidental, octave] = match;
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + SEMITONES[letter] + offset;
}

export function noteName(midi: number): { name: string; octave: number } {
  const rounded = Math.round(midi);
  return {
    name: SHARP_NAMES[((rounded % 12) + 12) % 12],
    octave: Math.floor(rounded / 12) - 1,
  };
}

/** Strips the octave from a note string ("F#3" → "F#"). */
export function pitchClass(note: string): string {
  return note.replace(/-?\d+$/, '');
}
