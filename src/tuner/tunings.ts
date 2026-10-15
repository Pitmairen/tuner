import { midiToFrequency, parseNote } from './notes';

export type InstrumentId = 'guitar' | 'bass' | 'ukulele';

/** How the microphone signal is analysed; see detectPitch. */
export type Detection = {
  /** Samples analysed per frame at 48 kHz. Longer windows hear lower notes but react slower. */
  windowSize: number;
  minFrequency: number;
  decimation: number;
};

/**
 * ~85 ms window, down to 55 Hz: responsive, for guitar and ukulele. Low enough
 * for B1 (the lowest custom guitar note) even with A4 calibrated down to 415.
 */
const FAST_DETECTION: Detection = { windowSize: 4096, minFrequency: 55, decimation: 2 };
/** ~170 ms window, down to ~28 Hz: reaches a 5-string bass's low B (31 Hz). */
export const WIDE_DETECTION: Detection = { windowSize: 8192, minFrequency: 28, decimation: 4 };

export type Instrument = {
  id: InstrumentId;
  name: string;
  /** Note range allowed in custom tunings (MIDI numbers). */
  minMidi: number;
  maxMidi: number;
  detection: Detection;
};

export const INSTRUMENTS: Instrument[] = [
  { id: 'guitar', name: 'Guitar', minMidi: 35, maxMidi: 72, detection: FAST_DETECTION },
  // B0 (31 Hz) to G3.
  { id: 'bass', name: 'Bass', minMidi: 23, maxMidi: 55, detection: WIDE_DETECTION },
  // G2 to A5.
  { id: 'ukulele', name: 'Ukulele', minMidi: 43, maxMidi: 81, detection: FAST_DETECTION },
];

export function instrument(id: InstrumentId): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export type Tuning = {
  id: string;
  name: string;
  instrument: InstrumentId;
  /**
   * In string order, from the highest-numbered string to the 1st, in
   * scientific pitch notation. Usually low to high, but not always: a
   * ukulele's re-entrant 4th string (G4) is higher than its 3rd.
   */
  notes: string[];
  /** Created by the user rather than built in. */
  custom?: boolean;
};

export type TuningString = {
  note: string;
  midi: number;
  frequency: number;
};

/** Pseudo-tuning id for chromatic mode: target the nearest note of any pitch. */
export const CHROMATIC_ID = 'chromatic';

/** Built-in tunings. Guitar ids predate other instruments, hence no prefix. */
export const TUNINGS: Tuning[] = [
  { id: 'standard', instrument: 'guitar', name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-d', instrument: 'guitar', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'half-down', instrument: 'guitar', name: 'Half Step Down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'full-down', instrument: 'guitar', name: 'Full Step Down', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'drop-c', instrument: 'guitar', name: 'Drop C', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'dadgad', instrument: 'guitar', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'open-g', instrument: 'guitar', name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-d', instrument: 'guitar', name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'open-e', instrument: 'guitar', name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: 'open-c', instrument: 'guitar', name: 'Open C', notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'] },

  { id: 'bass-standard', instrument: 'bass', name: 'Standard', notes: ['E1', 'A1', 'D2', 'G2'] },
  { id: 'bass-drop-d', instrument: 'bass', name: 'Drop D', notes: ['D1', 'A1', 'D2', 'G2'] },
  { id: 'bass-half-down', instrument: 'bass', name: 'Half Step Down', notes: ['Eb1', 'Ab1', 'Db2', 'Gb2'] },
  { id: 'bass-five', instrument: 'bass', name: '5-String', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] },

  { id: 'uke-standard', instrument: 'ukulele', name: 'Standard', notes: ['G4', 'C4', 'E4', 'A4'] },
  { id: 'uke-low-g', instrument: 'ukulele', name: 'Low G', notes: ['G3', 'C4', 'E4', 'A4'] },
  { id: 'uke-baritone', instrument: 'ukulele', name: 'Baritone', notes: ['D3', 'G3', 'B3', 'E4'] },
  { id: 'uke-d', instrument: 'ukulele', name: 'D Tuning', notes: ['A4', 'D4', 'F#4', 'B4'] },
];

export function tuningStrings(tuning: Tuning, a4?: number): TuningString[] {
  return tuning.notes.map((note) => {
    const midi = parseNote(note);
    return { note, midi, frequency: midiToFrequency(midi, a4) };
  });
}
