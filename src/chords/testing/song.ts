/**
 * Test-only synthesizer for whole songs: a chord progression played on a
 * guitar at a tempo, in a strumming or fingerpicking style. Returns the audio
 * and the true chord timeline to score a chord follower against.
 */
import { random, SAMPLE_RATE } from './synth';

const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

export type Style = 'quarters' | 'eighths' | 'chucks' | 'fingerpicked';

export type SongOptions = {
  /** Shapes like "x32010", with the name the follower should report. */
  progression: { shape: string; name: string }[];
  bpm: number;
  /** Beats each chord lasts. */
  beatsPerChord: number;
  /** How many times the progression repeats. */
  repeats: number;
  style: Style;
  seed: number;
  snrDb?: number;
  detuneCents?: number;
};

export type Song = {
  audio: Float32Array;
  /** The chord sounding over each span, in seconds. */
  truth: { start: number; end: number; name: string }[];
};

/** One slot per eighth note in a bar: D down, U up, x muted chuck, . nothing new. */
const PATTERNS: Record<Exclude<Style, 'fingerpicked'>, string> = {
  quarters: 'D.D.D.D.',
  eighths: 'DUDUDUDU',
  chucks: 'D.xUDUxU',
};
/** Fingerpicking: which sounding string (0 = bass) each eighth plucks. */
const PICKING = [0, 2, 3, 4, 3, 2, 3, 4];

type Pluck = { string: number; midi: number; time: number; loudness: number };

export function synthesizeSong({
  progression,
  bpm,
  beatsPerChord,
  repeats,
  style,
  seed,
  snrDb = 25,
  detuneCents = 5,
}: SongOptions): Song {
  const rand = random(seed);
  const eighth = 30 / bpm;
  const chordSeconds = beatsPerChord * (60 / bpm);
  const total = progression.length * repeats * chordSeconds + 1;
  const audio = new Float32Array(Math.ceil(total * SAMPLE_RATE));

  const plucks: Pluck[] = [];
  const cuts: { string: number; time: number }[] = [];
  const chucks: number[] = [];
  const truth: Song['truth'] = [];
  // Each string's tuning error stays the same for the whole song.
  const detune = OPEN_STRINGS.map(() => (rand() * 2 - 1) * detuneCents);
  let previousFrets: (number | null)[] = OPEN_STRINGS.map(() => null);

  for (let r = 0; r < repeats; r++) {
    progression.forEach(({ shape, name }, i) => {
      const start = (r * progression.length + i) * chordSeconds;
      truth.push({ start, end: start + chordSeconds, name });
      const frets = shape.split('').map((c) => (c === 'x' ? null : Number(c)));
      const sounding = frets.flatMap((f, s) => (f == null ? [] : [{ string: s, midi: OPEN_STRINGS[s] + f }]));
      // Changing chords silences every string whose fret changes: lifting or
      // moving a finger stops its note. Unchanged strings ring on. The hand
      // moves just before the strum (which may itself land slightly early).
      frets.forEach((f, s) => f !== previousFrets[s] && cuts.push({ string: s, time: start - 0.04 }));
      previousFrets = frets;

      const slots = Math.round(chordSeconds / eighth);
      for (let slot = 0; slot < slots; slot++) {
        // A little human timing wobble.
        const t = start + slot * eighth + (rand() - 0.5) * 0.02;
        if (style === 'fingerpicked') {
          const note = sounding[Math.min(PICKING[slot % 8], sounding.length - 1)];
          plucks.push({ ...note, time: t, loudness: 0.7 + 0.3 * rand() });
          continue;
        }
        const stroke = PATTERNS[style][slot % 8];
        if (stroke === 'x') {
          chucks.push(t);
          OPEN_STRINGS.forEach((_, s) => cuts.push({ string: s, time: t }));
        } else if (stroke !== '.') {
          // Down-strums sweep low to high; up-strums catch the top strings, lighter.
          const strings = stroke === 'D' ? sounding : sounding.slice(-4).reverse();
          const spread = 0.012 + 0.018 * rand();
          strings.forEach((note, k) =>
            plucks.push({
              ...note,
              time: t + (k / Math.max(1, strings.length - 1)) * spread,
              loudness: (stroke === 'D' ? 0.75 : 0.45) + 0.25 * rand(),
            }),
          );
        }
      }
    });
  }

  // Render every pluck until its string is plucked again or cut.
  const stops = OPEN_STRINGS.map((_, s) =>
    [...plucks.filter((p) => p.string === s).map((p) => p.time), ...cuts.filter((c) => c.string === s).map((c) => c.time)].sort(
      (a, b) => a - b,
    ),
  );
  for (const pluck of plucks) {
    const end = stops[pluck.string].find((t) => t > pluck.time) ?? total;
    renderString(audio, pluck, end, detune[pluck.string], rand);
  }
  for (const t of chucks) renderChuck(audio, t, rand);

  let power = 0;
  for (let i = 0; i < audio.length; i++) power += audio[i] * audio[i];
  const noise = Math.sqrt(power / audio.length) * 10 ** (-snrDb / 20);
  for (let i = 0; i < audio.length; i++) audio[i] += noise * (rand() + rand() + rand() - 1.5) * 2;

  return { audio, truth };
}

function renderString(out: Float32Array, pluck: Pluck, endSeconds: number, detuneCents: number, rand: () => number) {
  const f0 = 440 * 2 ** ((pluck.midi - 69 + detuneCents / 100) / 12);
  const pickPosition = 0.08 + 0.17 * rand();
  const start = Math.max(0, Math.round(pluck.time * SAMPLE_RATE));
  const end = Math.min(out.length, Math.round(endSeconds * SAMPLE_RATE));
  const release = Math.round(0.01 * SAMPLE_RATE);
  for (let h = 1; h <= 12; h++) {
    const f = h * f0 * Math.sqrt(1 + 0.0001 * h * h);
    if (f > 6000) break;
    let amplitude = (pluck.loudness * Math.abs(Math.sin(Math.PI * h * pickPosition))) / h ** 1.1;
    amplitude /= 1 + (100 / f) ** 2;
    const decay = Math.exp(-(0.8 + 0.5 * h) / SAMPLE_RATE);
    const omega = (2 * Math.PI * f) / SAMPLE_RATE;
    const cos = Math.cos(omega) * decay;
    const sin = Math.sin(omega) * decay;
    const phase = 2 * Math.PI * rand();
    let re = amplitude * Math.cos(phase);
    let im = amplitude * Math.sin(phase);
    // Ring until the string is cut, then a quick fretting-hand release.
    const stop = Math.min(out.length, end + release);
    for (let i = start; i < stop; i++) {
      out[i] += i < end ? im : im * (1 - (i - end) / release);
      const nextRe = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nextRe;
    }
  }
}

/** A muted strum: a short, pitchless percussive burst. */
function renderChuck(out: Float32Array, time: number, rand: () => number) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(0.04 * SAMPLE_RATE);
  for (let i = 0; i < length && start + i < out.length; i++) {
    out[start + i] += 0.3 * (rand() * 2 - 1) * Math.exp(-i / (0.008 * SAMPLE_RATE));
  }
}
