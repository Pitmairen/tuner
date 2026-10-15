import { readFileSync } from 'fs';
import { join } from 'path';

import { decodeWav } from '../audio/wav';
import { SongFollower } from '../chords/songFollower';
import { centsBetween, frequencyToMidi, midiToFrequency, noteName, parseNote } from '../tuner/notes';
import { detectPitch } from '../tuner/pitch';
import { instrument, InstrumentId } from '../tuner/tunings';

/** Real recordings: see test-recordings/README.md for how to add one. */
type Recording =
  | { file: string; mode: 'chords'; expect: string[]; historyErrors?: number; ignoreBass?: boolean; note?: string }
  | {
      file: string;
      mode: 'note';
      instrument: InstrumentId;
      expect: string;
      cents?: number;
      centsTolerance?: number;
      note?: string;
    };

const FOLDER = join(__dirname, '../../test-recordings');
const recordings: Recording[] = JSON.parse(readFileSync(join(FOLDER, 'manifest.json'), 'utf8'));
const load = (file: string) => decodeWav(new Uint8Array(readFileSync(join(FOLDER, file))));

/** Edit distance between two sequences of chord names. */
function editDistance(a: string[], b: string[]): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

describe('real recordings', () => {
  if (recordings.length === 0) {
    it.todo('add recordings to test-recordings/ (see its README)');
    return;
  }

  it.each(recordings.map((r) => [r.file, r] as const))('%s', (_, recording) => {
    const { samples, sampleRate } = load(recording.file);

    if (recording.mode === 'chords') {
      const follower = new SongFollower(sampleRate, { ignoreBass: recording.ignoreBass });
      for (let i = 0; i < samples.length; i += 1024) follower.push(samples.subarray(i, i + 1024));
      const heard = follower.state.history.map((h) => h.name);
      const errors = editDistance(heard, recording.expect);
      // Shown on failure: what the engine actually heard.
      expect({ heard, errors: errors <= (recording.historyErrors ?? 0) }).toEqual({ heard, errors: true });
      return;
    }

    const { windowSize, minFrequency, maxFrequency, decimation } = instrument(recording.instrument).detection;
    const frequencies: number[] = [];
    for (let start = 0; start + windowSize <= samples.length; start += windowSize / 4) {
      const result = detectPitch(samples.subarray(start, start + windowSize), sampleRate, {
        minFrequency,
        maxFrequency,
        decimation,
      });
      if (result && result.clarity >= 0.85) frequencies.push(result.frequency);
    }
    expect(frequencies.length).toBeGreaterThan(0);

    // The most common note heard, and the median offset from the expected one.
    const counts = new Map<string, number>();
    for (const f of frequencies) {
      const { name, octave } = noteName(frequencyToMidi(f));
      counts.set(`${name}${octave}`, (counts.get(`${name}${octave}`) ?? 0) + 1);
    }
    const heardNote = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const target = midiToFrequency(parseNote(recording.expect));
    const offsets = frequencies.map((f) => centsBetween(f, target)).sort((a, b) => a - b);
    const medianCents = Math.round(offsets[Math.floor(offsets.length / 2)]);
    const centsOk =
      recording.cents == null || Math.abs(medianCents - recording.cents) <= (recording.centsTolerance ?? 5);
    expect({ heardNote, medianCents, centsOk }).toEqual({ heardNote: parseNoteName(recording.expect), medianCents, centsOk: true });
  });
});

/** Normalises the expected note to the sharps the engine reports (Eb2 → D#2). */
function parseNoteName(note: string) {
  const { name, octave } = noteName(parseNote(note));
  return `${name}${octave}`;
}
