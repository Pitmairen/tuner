import { Chord, chordName, chordPitchClasses } from '../../chords/chords';

/**
 * Test-only: synthesizes band arrangements with known chords, to develop
 * the song analysis against. Deliberately unkind: the melody is loud and
 * sings notes outside the chord, the bass walks, drums are on every beat,
 * there is reverb and the whole mix is a little out of tune. Real
 * recordings will still be harder; treat scores on these as an upper bound.
 */

export type SynthSong = {
  samples: Float32Array;
  sampleRate: number;
  tuningCents: number;
  /** The chord at each time, as [start, end, chord]. */
  truth: { start: number; end: number; chord: Chord; name: string }[];
  description: string;
};

/** Deterministic random numbers (mulberry32), so a seed always makes the same song. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scale degrees (semitones above the key) and quality. */
const MAJOR_PROGRESSIONS: [number, 'maj' | 'min'][][] = [
  [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], // I V vi IV
  [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']], // vi IV I V
  [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], // I vi IV V
  [[2, 'min'], [7, 'maj'], [0, 'maj'], [0, 'maj']], // ii V I
  [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']], // I IV V IV
  [[0, 'maj'], [4, 'min'], [5, 'maj'], [7, 'maj']], // I iii IV V
];
const MINOR_PROGRESSIONS: [number, 'maj' | 'min'][][] = [
  [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], // i VI III VII
  [[0, 'min'], [5, 'min'], [7, 'min'], [0, 'min']], // i iv v i
  [[0, 'min'], [10, 'maj'], [8, 'maj'], [10, 'maj']], // i VII VI VII
  [[0, 'min'], [5, 'min'], [10, 'maj'], [3, 'maj']], // i iv VII III
];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const RATE = 44100;

export function synthesizeSong(seed: number, seconds = 45): SynthSong {
  const rand = random(seed);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
  const key = Math.floor(rand() * 12);
  const minor = rand() < 0.35;
  const progression = pick(minor ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS);
  const scale = (minor ? MINOR_SCALE : MAJOR_SCALE).map((d) => (key + d) % 12);
  const bpm = 80 + Math.floor(rand() * 60);
  const beat = 60 / bpm;
  // Beats per chord: two bars, a bar or half a bar.
  const beatsPerChord = pick([8, 4, 4, 4, 2]);
  const tuningCents = pick([0, 0, -20, 15, 30, -35]);
  const a4 = 440 * Math.pow(2, tuningCents / 1200);
  const freq = (midi: number) => a4 * Math.pow(2, (midi - 69) / 12);

  const length = Math.floor(seconds * RATE);
  const tracks = {
    drums: new Float32Array(length),
    bass: new Float32Array(length),
    comp: new Float32Array(length),
    pad: new Float32Array(length),
    vocal: new Float32Array(length),
  };

  // Chord timeline, with a bar of drums only before the band comes in.
  const truth: SynthSong['truth'] = [];
  const intro = 4 * beat;
  for (let t = intro, i = 0; t < seconds; t += beatsPerChord * beat, i++) {
    const [degree, quality] = progression[i % progression.length];
    const root = (key + degree) % 12;
    const chord: Chord = { root, quality, bass: root };
    truth.push({ start: t, end: Math.min(seconds, t + beatsPerChord * beat), chord, name: chordName(chord) });
  }

  // Drums: kick on 1 and 3 (and some offbeats), snare on 2 and 4, eighth-note hats.
  for (let b = 0; b * beat < seconds; b++) {
    const t = b * beat;
    if (b % 2 === 0 || rand() < 0.2) kick(tracks.drums, t, 0.9);
    if (b % 2 === 1) snare(tracks.drums, t, 0.6, rand);
    hat(tracks.drums, t, 0.25, rand);
    hat(tracks.drums, t + beat / 2, 0.18, rand);
  }

  for (const segment of truth) {
    const tones = chordPitchClasses(segment.chord.root, segment.chord.quality);
    const beats = Math.round((segment.end - segment.start) / beat);
    // Bass: mostly the root, sometimes the fifth, and a walk into the next chord.
    for (let b = 0; b < beats; b++) {
      const t = segment.start + b * beat;
      let pc = segment.chord.root;
      if (b % 2 === 1 && rand() < 0.4) pc = tones[2];
      if (b === beats - 1 && rand() < 0.5) pc = pick(scale);
      const midi = 28 + ((pc - 4 + 12) % 12); // E1..D#2
      pluck(tracks.bass, t, beat * 0.95, freq(midi + (rand() < 0.3 ? 12 : 0)), 0.8, 8, 3);
    }
    // Comping: the chord voiced around middle C, in a random inversion, on each beat or offbeat.
    const inversion = Math.floor(rand() * 3);
    const voicing = tones.map((pc, i) => 48 + ((pc - 48 % 12 + 12) % 12) + (i < inversion ? 12 : 0));
    for (let b = 0; b < beats * 2; b++) {
      if (rand() < 0.45) continue;
      const t = segment.start + (b * beat) / 2;
      for (const midi of voicing) pluck(tracks.comp, t + rand() * 0.01, beat, freq(midi), 0.28, 12, 5);
    }
    // Pad: the chord held an octave up, quietly.
    for (const pc of tones) sustain(tracks.pad, segment.start, segment.end - segment.start, freq(60 + ((pc - 60 % 12 + 12) % 12)), 0.12);
  }

  // Melody: phrases of eighth and quarter notes, about half outside the chord.
  let pitch = 64 + key % 12;
  for (let t = intro; t < seconds - 1; ) {
    const phrase = (2 + Math.floor(rand() * 3)) * 4 * beat;
    const end = Math.min(seconds - 1, t + phrase);
    const notes: { start: number; length: number; midi: number }[] = [];
    while (t < end) {
      const segment = truth.find((s) => t >= s.start && t < s.end) ?? truth[truth.length - 1];
      const length = (rand() < 0.5 ? 0.5 : 1) * beat * (rand() < 0.15 ? 2 : 1);
      const chordTone = rand() < 0.55;
      const pcs = chordTone ? chordPitchClasses(segment.chord.root, segment.chord.quality) : scale;
      // Stay near the previous note.
      const candidates = [];
      for (let m = 58; m <= 77; m++) if (pcs.includes(m % 12) && Math.abs(m - pitch) <= 5) candidates.push(m);
      pitch = candidates.length ? pick(candidates) : pitch;
      notes.push({ start: t, length, midi: pitch });
      t += length;
    }
    sing(tracks.vocal, notes, freq, 0.55, rand);
    t = end + beat * (1 + Math.floor(rand() * 4));
  }

  const mix = new Float32Array(length);
  const gains = { drums: 1, bass: 0.9, comp: 0.8, pad: 0.7, vocal: 1.3 };
  for (const [name, track] of Object.entries(tracks)) {
    const gain = gains[name as keyof typeof gains];
    for (let i = 0; i < length; i++) mix[i] += track[i] * gain;
  }
  const wet = reverb(mix);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    mix[i] = mix[i] * 0.8 + wet[i] * 0.25;
    peak = Math.max(peak, Math.abs(mix[i]));
  }
  for (let i = 0; i < length; i++) mix[i] *= 0.9 / peak;

  const names = truth.slice(0, progression.length).map((s) => s.name).join(' ');
  return {
    samples: mix,
    sampleRate: RATE,
    tuningCents,
    truth,
    description: `${bpm} bpm, ${names}, ${beatsPerChord} beats per chord, ${tuningCents >= 0 ? '+' : ''}${tuningCents} cents`,
  };
}

/*
 * The voices below rotate phasors (re, im) instead of calling Math.sin and
 * Math.exp per sample, as tone.ts does: Babel-compiled loops in Jest (and
 * Hermes) are slow at those, and a song needs millions of samples.
 */

/** A plucked note: harmonics with 1/h^rolloff amplitude, high ones decaying faster. */
function pluck(out: Float32Array, start: number, duration: number, f0: number, level: number, harmonics: number, decay: number) {
  const begin = Math.floor(start * RATE);
  const end = Math.min(out.length, begin + Math.floor((duration + 0.3) * RATE));
  const attack = RATE / 400;
  const releaseStart = begin + Math.floor(duration * RATE);
  const release = 0.3 * RATE;
  for (let h = 1; h <= harmonics && f0 * h < RATE / 2.5; h++) {
    const fade = Math.exp(-(decay * (1 + 0.4 * h)) / RATE);
    const omega = (2 * Math.PI * f0 * h) / RATE;
    const cos = Math.cos(omega) * fade;
    const sin = Math.sin(omega) * fade;
    // Start at phase h, as a sine.
    let re = (level / Math.pow(h, 1.2)) * Math.cos(h);
    let im = (level / Math.pow(h, 1.2)) * Math.sin(h);
    for (let i = begin; i < end; i++) {
      const n = i - begin;
      const envelope = (n < attack ? n / attack : 1) * (i > releaseStart ? Math.max(0, 1 - (i - releaseStart) / release) : 1);
      out[i] += im * envelope;
      const nextRe = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nextRe;
    }
  }
}

/** A held note with slow attack and release: a sawtooth-like pad. */
function sustain(out: Float32Array, start: number, duration: number, f0: number, level: number) {
  const begin = Math.floor(start * RATE);
  const end = Math.min(out.length, begin + Math.floor(duration * RATE));
  const attack = 0.3 * RATE;
  const release = 0.2 * RATE;
  for (let h = 1; h <= 8; h++) {
    const omega = (2 * Math.PI * f0 * h * (1 + 0.0006 * (h % 3))) / RATE;
    const cos = Math.cos(omega);
    const sin = Math.sin(omega);
    let re = level / h;
    let im = 0;
    for (let i = begin; i < end; i++) {
      const envelope = Math.min(1, (i - begin) / attack) * Math.min(1, (end - i) / release);
      out[i] += im * envelope;
      const nextRe = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nextRe;
    }
  }
}

/** Samples between updates of the sung line's formant gains; its pitch moves slowly. */
const FORMANT_UPDATE = 64;
const SUNG_HARMONICS = 24;

/** A sung line: glides between notes, vibrato after the attack, vowel-like formants. */
function sing(out: Float32Array, notes: { start: number; length: number; midi: number }[], freq: (m: number) => number, level: number, rand: () => number) {
  if (!notes.length) return;
  const begin = Math.floor(notes[0].start * RATE);
  const last = notes[notes.length - 1];
  const end = Math.min(out.length, Math.floor((last.start + last.length) * RATE));
  const vibratoRate = 5 + rand() * 1.5;
  const formants = [[pickFrom(rand, [500, 700, 400]), 90], [pickFrom(rand, [1100, 1500, 2000]), 120], [2700, 200]];
  const gains = new Float64Array(SUNG_HARMONICS + 1);
  const glide = 1 - Math.exp(-1 / (0.04 * RATE));
  let phase = 0;
  let current = freq(notes[0].midi);
  let n = 0;
  for (let i = begin; i < end; i++) {
    const t = i / RATE;
    while (n < notes.length - 1 && t >= notes[n + 1].start) n++;
    const note = notes[n];
    // Portamento: ~40 ms to reach the new note.
    current += (freq(note.midi) - current) * glide;
    const sinceStart = t - note.start;
    const vibrato = sinceStart > 0.15 ? Math.pow(2, (25 * Math.sin(2 * Math.PI * vibratoRate * t)) / 1200) : 1;
    const f0 = current * vibrato;
    if ((i - begin) % FORMANT_UPDATE === 0) {
      for (let h = 1; h <= SUNG_HARMONICS; h++) {
        let gain = 0.05;
        for (const [center, width] of formants) gain += Math.exp(-Math.pow((f0 * h - center) / width, 2));
        gains[h] = f0 * h < RATE / 2.5 ? gain / Math.sqrt(h) : 0;
      }
    }
    const envelope = Math.min(1, sinceStart / 0.03) * Math.min(1, (note.start + note.length - t) / 0.05 + 0.3);
    phase += (2 * Math.PI * f0) / RATE;
    // Harmonic h is the fundamental's phasor to the power h.
    const baseRe = Math.cos(phase);
    const baseIm = Math.sin(phase);
    let re = baseRe;
    let im = baseIm;
    let value = 0;
    for (let h = 1; h <= SUNG_HARMONICS; h++) {
      value += gains[h] * im;
      const nextRe = re * baseRe - im * baseIm;
      im = re * baseIm + im * baseRe;
      re = nextRe;
    }
    out[i] += level * 0.3 * envelope * value;
  }
}

function pickFrom<T>(rand: () => number, items: T[]) {
  return items[Math.floor(rand() * items.length)];
}

function kick(out: Float32Array, start: number, level: number) {
  const begin = Math.floor(start * RATE);
  let phase = 0;
  for (let i = begin; i < Math.min(out.length, begin + RATE * 0.35); i++) {
    const t = (i - begin) / RATE;
    phase += (2 * Math.PI * (45 + 90 * Math.exp(-t * 30))) / RATE;
    out[i] += level * Math.exp(-t * 9) * Math.sin(phase);
  }
}

function snare(out: Float32Array, start: number, level: number, rand: () => number) {
  const begin = Math.floor(start * RATE);
  for (let i = begin; i < Math.min(out.length, begin + RATE * 0.2); i++) {
    const t = (i - begin) / RATE;
    out[i] += level * Math.exp(-t * 18) * ((rand() * 2 - 1) * 0.8 + 0.4 * Math.sin(2 * Math.PI * 185 * t));
  }
}

function hat(out: Float32Array, start: number, level: number, rand: () => number) {
  const begin = Math.floor(start * RATE);
  let previous = 0;
  for (let i = begin; i < Math.min(out.length, begin + RATE * 0.06); i++) {
    const t = (i - begin) / RATE;
    const white = rand() * 2 - 1;
    // Differencing the noise leaves mostly the highs.
    out[i] += level * Math.exp(-t * 60) * (white - previous);
    previous = white;
  }
}

/** A small Schroeder reverb: parallel combs into series all-passes. */
function reverb(input: Float32Array): Float32Array {
  const combs = [1557, 1617, 1491, 1422].map((delay) => ({ delay, buffer: new Float32Array(delay), index: 0 }));
  const allpasses = [225, 556].map((delay) => ({ delay, buffer: new Float32Array(delay), index: 0 }));
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let sum = 0;
    for (const comb of combs) {
      const y = comb.buffer[comb.index];
      comb.buffer[comb.index] = input[i] + y * 0.8;
      comb.index = (comb.index + 1) % comb.delay;
      sum += y;
    }
    let y = sum / combs.length;
    for (const ap of allpasses) {
      const buffered = ap.buffer[ap.index];
      const v = y + buffered * 0.5;
      ap.buffer[ap.index] = v;
      ap.index = (ap.index + 1) % ap.delay;
      y = buffered - v * 0.5;
    }
    out[i] = y;
  }
  return out;
}
