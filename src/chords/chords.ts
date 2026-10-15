export type ChordQuality = 'maj' | 'min' | '7' | 'maj7' | 'm7' | 'add9' | 'sus2' | 'sus4' | 'dim' | 'aug' | '5';

type Template = {
  quality: ChordQuality;
  /** Semitones above the root. */
  intervals: number[];
  /** Suffix after the root name, e.g. "m7". */
  suffix: string;
  /** Slight preference for common chords when scores tie. */
  prior: number;
  /**
   * Intervals that must be clearly heard (at least COLOR_TONE_MIN strong)
   * for this chord to be named: a major chord's 5th has its 3rd harmonic on
   * the 9th, so a faint 9th is usually that overtone, not an add9.
   */
  colorTones?: number[];
};

export const COLOR_TONE_MIN = 0.45;

export const TEMPLATES: Template[] = [
  { quality: 'maj', intervals: [0, 4, 7], suffix: '', prior: 0.06 },
  { quality: 'min', intervals: [0, 3, 7], suffix: 'm', prior: 0.06 },
  { quality: '7', intervals: [0, 4, 7, 10], suffix: '7', prior: 0.03 },
  { quality: 'maj7', intervals: [0, 4, 7, 11], suffix: 'maj7', prior: 0.02 },
  { quality: 'm7', intervals: [0, 3, 7, 10], suffix: 'm7', prior: 0.03 },
  { quality: 'add9', intervals: [0, 2, 4, 7], suffix: 'add9', prior: 0.01, colorTones: [2] },
  { quality: 'sus2', intervals: [0, 2, 7], suffix: 'sus2', prior: 0.01 },
  { quality: 'sus4', intervals: [0, 5, 7], suffix: 'sus4', prior: 0.01 },
  { quality: 'dim', intervals: [0, 3, 6], suffix: 'dim', prior: 0 },
  { quality: 'aug', intervals: [0, 4, 8], suffix: 'aug', prior: 0 },
  { quality: '5', intervals: [0, 7], suffix: '5', prior: 0.02 },
];

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type Chord = {
  /** Pitch class of the root, 0 = C. */
  root: number;
  quality: ChordQuality;
  /** Pitch class of the lowest note, which may differ from the root (C/E). */
  bass: number;
};

/** "Am7", "C/E", "E5". Uses sharps, as the rest of the app does. */
export function chordName({ root, quality, bass }: Chord): string {
  const { suffix } = TEMPLATES.find((t) => t.quality === quality)!;
  const name = `${PITCH_NAMES[root]}${suffix}`;
  return bass === root ? name : `${name}/${PITCH_NAMES[bass]}`;
}

export function chordPitchClasses(root: number, quality: ChordQuality): number[] {
  const { intervals } = TEMPLATES.find((t) => t.quality === quality)!;
  return intervals.map((i) => (root + i) % 12);
}
