import { midiToFrequency, parseNote } from './notes';

export type Tuning = {
  id: string;
  name: string;
  /** Strings from lowest (6th) to highest (1st), in scientific pitch notation. */
  notes: string[];
  /** Created by the user rather than built in. */
  custom?: boolean;
};

export type TuningString = {
  note: string;
  midi: number;
  frequency: number;
};

export const TUNINGS: Tuning[] = [
  { id: 'standard', name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-d', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'half-down', name: 'Half Step Down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'full-down', name: 'Full Step Down', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'drop-c', name: 'Drop C', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'open-g', name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-d', name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'open-e', name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: 'open-c', name: 'Open C', notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'] },
];

export function tuningStrings(tuning: Tuning, a4?: number): TuningString[] {
  return tuning.notes.map((note) => {
    const midi = parseNote(note);
    return { note, midi, frequency: midiToFrequency(midi, a4) };
  });
}
