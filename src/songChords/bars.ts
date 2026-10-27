import { Chord } from '../chords/chords';
import { Key, Segment } from './chordModel';

/**
 * Groups the chords into bars, as a chord sheet writes them: "| G | C D |".
 * The meter (4/4 or 3/4) and where bars start are guessed from the chords
 * themselves, since chords mostly change on the first beat of a bar.
 */

export type BarChord = {
  chord: Chord | null;
  key: Key;
  /** Beats it lasts within the bar. */
  beats: number;
  start: number;
  end: number;
};

export type Bar = {
  start: number;
  end: number;
  /** In order; a chord carried over from the bar before is listed again. */
  chords: BarChord[];
};

export type BarChart = {
  beatsPerBar: number;
  bars: Bar[];
};

/** 3/4 must explain this much more of the chord changes to beat the far more common 4/4. */
const THREE_FOUR_MARGIN = 0.15;

export function chordBars(beats: number[], segments: Segment[]): BarChart {
  if (beats.length < 2 || segments.length === 0) return { beatsPerBar: 4, bars: [] };
  // The chord of each beat: the one sounding a little after the beat, so a
  // change landing a frame late still counts for the right beat.
  const beatSegments = beats.map((time, i) => {
    const next = beats[i + 1] ?? time + (time - beats[i - 1]);
    const probe = time + 0.25 * (next - time);
    return segments.find((s) => probe >= s.start && probe < s.end) ?? segments[segments.length - 1];
  });
  const changes: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    if (beatSegments[i].chord && !sameChord(beatSegments[i].chord, beatSegments[i - 1].chord)) changes.push(i);
  }

  // The meter that puts the most chord changes on beat one.
  const fit = (beatsPerBar: number) => {
    let best = 0;
    for (let phase = 0; phase < beatsPerBar; phase++) {
      const onDownbeat = changes.filter((i) => (i - phase) % beatsPerBar === 0).length;
      best = Math.max(best, changes.length ? onDownbeat / changes.length : 0);
    }
    return best;
  };
  const beatsPerBar = fit(3) > fit(4) + THREE_FOUR_MARGIN ? 3 : 4;
  const isChange = new Array(beats.length).fill(false);
  for (const i of changes) isChange[i] = true;
  const position = barPositions(isChange, beatsPerBar);

  // Bars start where the position is 1. Beats before the first such beat
  // form a short opening bar (a pickup); a bar cut short where the position
  // shifts is the song's extra half bar.
  const starts: number[] = [];
  for (let i = 0; i < beats.length; i++) if (i === 0 || position[i] === 0) starts.push(i);
  const songEnd = beats[beats.length - 1] + (beats[beats.length - 1] - beats[beats.length - 2]);

  const bars: Bar[] = [];
  starts.forEach((first, n) => {
    const last = starts[n + 1] ?? beats.length;
    const end = beats[last] ?? songEnd;
    const bar: Bar = { start: beats[first], end, chords: [] };
    for (let i = first; i < last; i++) {
      const segment = beatSegments[i];
      const beatEnd = beats[i + 1] ?? end;
      const previous = bar.chords[bar.chords.length - 1];
      if (previous && sameChord(previous.chord, segment.chord)) {
        previous.beats++;
        previous.end = beatEnd;
      } else {
        bar.chords.push({ chord: segment.chord, key: segment.key, beats: 1, start: beats[i], end: beatEnd });
      }
    }
    bars.push(bar);
  });
  return { beatsPerBar, bars };
}

/**
 * How likely a chord change is on each beat of the bar: mostly on beat one,
 * often on beat three in 4/4, rarely in between.
 */
const CHANGE_AT: Record<number, number[]> = { 4: [0.6, 0.06, 0.2, 0.06], 3: [0.7, 0.12, 0.12] };
/** The chance, per beat, that the bar lines shift (an extra half bar, a bar of 2/4). */
const SHIFT = 0.02;

/**
 * Each beat's position in its bar (0 = beat one), letting the bar lines
 * shift now and then: songs often add half a bar, and one position for the
 * whole song would then put every later bar line in the middle of a bar.
 * A Viterbi pass over the beats, with the states being where bars start.
 */
function barPositions(isChange: boolean[], beatsPerBar: number): number[] {
  const change = CHANGE_AT[beatsPerBar];
  const logChange = change.map((p) => Math.log(p));
  const logSteady = change.map((p) => Math.log(1 - p));
  const logStay = Math.log(1 - SHIFT);
  const logShift = Math.log(SHIFT / (beatsPerBar - 1));
  const B = isChange.length;
  // State p: bars start on beats i with (i - p) % beatsPerBar === 0.
  const P = beatsPerBar;
  let score = new Float64Array(P);
  const back = new Int8Array(B * P);
  for (let i = 0; i < B; i++) {
    const next = new Float64Array(P);
    let best = 0;
    for (let p = 1; p < P; p++) if (score[p] > score[best]) best = p;
    for (let p = 0; p < P; p++) {
      const position = (((i - p) % P) + P) % P;
      const emission = isChange[i] ? logChange[position] : logSteady[position];
      const stay = score[p] + logStay;
      const shift = score[best] + logShift;
      back[i * P + p] = best !== p && shift > stay ? best : p;
      next[p] = Math.max(stay, best !== p ? shift : -Infinity) + emission;
    }
    score = next;
  }
  let p = 0;
  for (let q = 1; q < P; q++) if (score[q] > score[p]) p = q;
  const positions = new Array(B);
  for (let i = B - 1; i >= 0; i--) {
    positions[i] = (((i - p) % P) + P) % P;
    p = back[i * P + p];
  }
  return positions;
}

function sameChord(a: Chord | null, b: Chord | null) {
  if (!a || !b) return !a && !b;
  return a.root === b.root && a.quality === b.quality;
}
