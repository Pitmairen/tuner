import { parseNote } from '../notes';
import {
  detectionFor,
  instrument,
  INSTRUMENTS,
  MAX_TRANSPOSE,
  MIN_TRANSPOSE,
  transposeLabel,
  TUNINGS,
  tuningStrings,
  WIDE_DETECTION,
} from '../tunings';

describe('tunings', () => {
  it('has unique ids and valid notes within each instrument’s range', () => {
    expect(new Set(TUNINGS.map((t) => t.id)).size).toBe(TUNINGS.length);
    for (const tuning of TUNINGS) {
      const { minMidi, maxMidi } = instrument(tuning.instrument);
      for (const note of tuning.notes) {
        const midi = parseNote(note);
        expect({ tuning: tuning.id, note, inRange: midi >= minMidi && midi <= maxMidi }).toEqual({
          tuning: tuning.id,
          note,
          inRange: true,
        });
      }
    }
  });

  it('keeps the original guitar ids that saved settings refer to', () => {
    expect(TUNINGS.find((t) => t.id === 'standard')?.notes).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(TUNINGS.find((t) => t.id === 'drop-d')?.instrument).toBe('guitar');
  });

  it('every instrument has tunings', () => {
    for (const { id } of INSTRUMENTS) expect(TUNINGS.some((t) => t.instrument === id)).toBe(true);
  });
});

describe('tuningStrings', () => {
  const standard = TUNINGS[0];

  it('keeps the tuning’s spelling when not transposed', () => {
    const halfDown = TUNINGS.find((t) => t.id === 'half-down')!;
    expect(tuningStrings(halfDown).map((s) => s.note)).toEqual(halfDown.notes);
  });

  it('shifts every string for a capo or transpose', () => {
    expect(tuningStrings(standard, 440, 2).map((s) => s.note)).toEqual(['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4']);
    expect(tuningStrings(standard, 440, -1).map((s) => s.note)).toEqual(['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4']);
  });

  it('follows the reference pitch', () => {
    const [lowE] = tuningStrings(standard, 442);
    expect(lowE.frequency).toBeCloseTo(82.78, 2);
  });
});

describe('detectionFor', () => {
  it('keeps the instrument’s detection when the targets fit', () => {
    const guitar = instrument('guitar').detection;
    expect(detectionFor(guitar, tuningStrings(TUNINGS[0]))).toBe(guitar);
    expect(detectionFor(guitar, tuningStrings(TUNINGS[0], 440, 2))).toBe(guitar);
  });

  it('widens only as far as needed for far-transposed targets', () => {
    const fiveString = TUNINGS.find((t) => t.id === 'bass-five')!;
    const detection = detectionFor(instrument('bass').detection, tuningStrings(fiveString, 415, MIN_TRANSPOSE));
    expect(detection.windowSize).toBe(WIDE_DETECTION.windowSize);
    expect(detection.minFrequency).toBeGreaterThanOrEqual(20);
  });

  it('can reach every target of every tuning at every transpose and A4 extreme', () => {
    const unreachable: string[] = [];
    for (const tuning of TUNINGS) {
      for (let transpose = MIN_TRANSPOSE; transpose <= MAX_TRANSPOSE; transpose++) {
        for (const a4 of [415, 450]) {
          const strings = tuningStrings(tuning, a4, transpose);
          const d = detectionFor(instrument(tuning.instrument).detection, strings);
          for (const s of strings) {
            if (s.frequency < d.minFrequency || s.frequency > d.maxFrequency) unreachable.push(`${tuning.id} ${s.note}`);
          }
        }
      }
    }
    expect(unreachable).toEqual([]);
  });
});

describe('transposeLabel', () => {
  it('labels capos and downward shifts', () => {
    expect(transposeLabel(0)).toBeNull();
    expect(transposeLabel(3)).toBe('Capo 3');
    expect(transposeLabel(-2)).toBe('−2 st');
  });
});
