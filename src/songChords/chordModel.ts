import { Chord, chordPitchClasses, TEMPLATES } from '../chords/chords';
import { ChromaFrame } from './frames';

/**
 * Chord recognition over a whole song: each frame's chroma is compared
 * with chord templates, and a hidden Markov model (Viterbi) picks the most
 * likely sequence of keys and chords. A chord only changes when the
 * evidence holds up for a while, not on every passing melody note, and the
 * key decides close calls: in G minor, a chord with G and D but an unclear
 * third (a power chord under a melody) is Gm, not G.
 */

export type ModelOptions = {
  /** How sharply the emission favours the best-matching chord. */
  sharpness?: number;
  /** Weight of the bass chroma against the treble. */
  bassWeight?: number;
  /** Expected seconds per chord; sets how hard it is to change chord (without beats). */
  chordSeconds?: number;
  /** With beats: the chance of a chord change on each beat. */
  beatChange?: number;
  /** With beats: changes between beats, as a fraction of the chordSeconds rate. */
  offBeat?: number;
  /** Expected seconds between key changes. */
  keySeconds?: number;
  /** How much the key's chords are preferred when the chord changes (0 = not at all). */
  keyWeight?: number;
  /** Similarity a "no chord" frame is given; frames matching worse show no chord. */
  noChordSimilarity?: number;
  /** Frames quieter than this fraction of the song's median energy count as silence. */
  silenceRatio?: number;
};

export type Key = {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  minor: boolean;
  /** "G", "Gm", "Eb", "F#m". */
  name: string;
};

export type Segment = {
  start: number;
  end: number;
  /** Null for no chord (silence, drums only, spoken parts). */
  chord: Chord | null;
  /** Spelled for the key: "Eb" in G minor, "D#m" in B major. "N" for no chord. */
  name: string;
  key: Key;
};

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** For C major and A minor, which have no sharps or flats: the usual names for chords outside the key. */
const NEUTRAL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Major keys written with flats (F, Bb, Eb, Ab, Db, Gb); the others use sharps. */
const FLAT_MAJOR_KEYS = [5, 10, 3, 8, 1, 6];

/** Note names for a key: flats in flat keys, sharps in sharp keys. */
function spelling(key: { tonic: number; minor: boolean }): string[] {
  const relativeMajor = key.minor ? (key.tonic + 3) % 12 : key.tonic;
  if (relativeMajor === 0) return NEUTRAL;
  return FLAT_MAJOR_KEYS.includes(relativeMajor) ? FLATS : SHARPS;
}

export function spellChord(chord: Chord, key: { tonic: number; minor: boolean }): string {
  const names = spelling(key);
  const name = names[chord.root] + TEMPLATES.find((t) => t.quality === chord.quality)!.suffix;
  return chord.bass === chord.root ? name : `${name}/${names[chord.bass]}`;
}

/**
 * How likely each chord is in a key, as [semitones above the tonic,
 * quality, weight]. Weight 1 for the key's own chords, less for chords
 * commonly borrowed into it. Chords not listed get OTHER_CHORD.
 */
const MAJOR_KEY_CHORDS: [number, 'maj' | 'min', number][] = [
  [0, 'maj', 1], [2, 'min', 1], [4, 'min', 1], [5, 'maj', 1], [7, 'maj', 1], [9, 'min', 1],
  [10, 'maj', 0.4], // bVII (Mixolydian, rock)
  [5, 'min', 0.25], // iv borrowed from the minor
  [2, 'maj', 0.25], // II (V of V)
  [4, 'maj', 0.2], // III (V of vi)
  [9, 'maj', 0.15], // VI (V of ii)
  [8, 'maj', 0.2], // bVI
  [3, 'maj', 0.15], // bIII
];
const MINOR_KEY_CHORDS: [number, 'maj' | 'min', number][] = [
  [0, 'min', 1], [3, 'maj', 1], [5, 'min', 1], [7, 'min', 0.6], [7, 'maj', 1], [8, 'maj', 1], [10, 'maj', 1],
  [5, 'maj', 0.25], // IV (Dorian)
  [2, 'min', 0.15], // ii (with a raised 6th)
  [0, 'maj', 0.15], // I (Picardy third)
  [1, 'maj', 0.1], // bII (Neapolitan)
];
const OTHER_CHORD = 0.03;

type State = { chord: Chord | null; treble: Float32Array; bass: Float32Array };

/** Overtones folded onto pitch classes: the 2nd and 4th are the octave, the 3rd a fifth up. */
const HARMONIC_INTERVALS = [0, 12, 19, 24];
const HARMONIC_DECAY = 0.6;

/** Treble and bass templates for a chord's notes, with their overtones folded in. */
export function chordTemplate(pitchClasses: number[], root: number) {
  const treble = new Float32Array(12);
  for (const pc of pitchClasses) {
    HARMONIC_INTERVALS.forEach((interval, h) => {
      treble[(pc + interval) % 12] += Math.pow(HARMONIC_DECAY, h);
    });
  }
  const bass = new Float32Array(12);
  bass[root] = 1;
  for (const pc of pitchClasses) if (pc !== root) bass[pc] += 0.25;
  return { treble: unit(treble), bass: unit(bass) };
}

function unit(values: Float32Array) {
  let norm = 0;
  for (let i = 0; i < values.length; i++) norm += values[i] * values[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < values.length; i++) values[i] /= norm;
  return values;
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0;
  let na = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
  }
  return na > 0 ? dot / Math.sqrt(na) : 0;
}

/** The 24 major and minor chords (C, C#, ... then Cm, C#m, ...), and "no chord" last. */
function chordStates(): State[] {
  const result: State[] = [];
  for (const quality of ['maj', 'min'] as const) {
    for (let root = 0; root < 12; root++) {
      const chord: Chord = { root, quality, bass: root };
      result.push({ chord, ...chordTemplate(chordPitchClasses(root, quality), root) });
    }
  }
  result.push({ chord: null, treble: new Float32Array(12), bass: new Float32Array(12) });
  return result;
}

/** The 24 keys: C..B major, then C..B minor. */
function keys(): Key[] {
  const result: Key[] = [];
  for (const minor of [false, true]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const key = { tonic, minor };
      result.push({ ...key, name: spelling(key)[tonic] + (minor ? 'm' : '') });
    }
  }
  return result;
}

/** log P(chord | key) for every key and chord state, normalised per key. */
function chordPriors(keyList: Key[], chordList: State[], keyWeight: number): Float64Array {
  const C = chordList.length;
  const priors = new Float64Array(keyList.length * C);
  keyList.forEach((key, k) => {
    const table = key.minor ? MINOR_KEY_CHORDS : MAJOR_KEY_CHORDS;
    const weights = chordList.map(({ chord }) => {
      // "No chord" is as likely in every key: it's about silence, not harmony.
      if (!chord) return 1;
      const entry = table.find(([offset, quality]) => (key.tonic + offset) % 12 === chord.root && quality === chord.quality);
      return Math.pow(entry ? entry[2] : OTHER_CHORD, keyWeight);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    weights.forEach((w, c) => (priors[k * C + c] = Math.log(w / total)));
  });
  return priors;
}

/**
 * `beats` (frame indices) make chord changes likely on a beat and unlikely
 * between beats; without them every frame is equally likely.
 */
export function recogniseChords(frames: ChromaFrame[], frameSeconds: number, options: ModelOptions = {}, beats?: number[]): Segment[] {
  const {
    sharpness = 30,
    bassWeight = 0.3,
    chordSeconds = 2,
    beatChange = 0.25,
    offBeat = 0.1,
    keySeconds = 60,
    keyWeight = 1,
    noChordSimilarity = 0.55,
    silenceRatio = 0.05,
  } = options;
  const chordList = chordStates();
  const keyList = keys();
  const C = chordList.length;
  const K = keyList.length;
  const S = K * C;
  const noChord = C - 1;
  const T = frames.length;
  if (T === 0) return [];

  const energies = frames.map((f) => f.energy).sort((a, b) => a - b);
  const silence = energies[Math.floor(energies.length / 2)] * silenceRatio;

  // Log emission per frame and chord (the key doesn't change what is heard).
  const emission = new Float32Array(T * C);
  for (let t = 0; t < T; t++) {
    const { treble, bass, energy } = frames[t];
    const quiet = energy <= silence;
    for (let c = 0; c < C; c++) {
      let similarity: number;
      if (c === noChord) similarity = quiet ? 1 : noChordSimilarity;
      else if (quiet) similarity = 0;
      else similarity = (cosine(treble, chordList[c].treble) + bassWeight * cosine(bass, chordList[c].bass)) / (1 + bassWeight);
      emission[t * C + c] = sharpness * similarity;
    }
  }

  // Transitions: stay on the chord; change chord within the key (picking
  // the new one by how likely it is in the key); or, rarely, change key.
  const prior = chordPriors(keyList, chordList, keyWeight);
  const keyChange = frameSeconds / keySeconds;
  // The chance of a chord change in each frame. A beat's position is only
  // good to about a frame, so its chance is shared with the frames beside it.
  const change = new Float64Array(T).fill(frameSeconds / chordSeconds);
  if (beats && beats.length > 1) {
    change.fill((offBeat * frameSeconds) / chordSeconds);
    for (const b of beats) {
      for (let t = b - 1; t <= b + 1; t++) if (t >= 0 && t < T) change[t] = beatChange / 3;
    }
  }
  const logNewKey = Math.log(keyChange / (K - 1));

  let score = new Float64Array(S);
  for (let k = 0; k < K; k++) for (let c = 0; c < C; c++) score[k * C + c] = prior[k * C + c] + emission[c] - Math.log(K);
  const back = new Uint16Array(T * S);
  const bestInKey = new Int32Array(K);
  for (let t = 1; t < T; t++) {
    // The best state in each key, and the best and second-best keys overall
    // (a key change comes from the best state in another key).
    let first = -1;
    let second = -1;
    for (let k = 0; k < K; k++) {
      let best = k * C;
      for (let c = 1; c < C; c++) if (score[k * C + c] > score[best]) best = k * C + c;
      bestInKey[k] = best;
      if (first < 0 || score[best] > score[bestInKey[first]]) {
        second = first;
        first = k;
      } else if (second < 0 || score[best] > score[bestInKey[second]]) {
        second = k;
      }
    }
    const logStay = Math.log(1 - change[t] - keyChange);
    const logMove = Math.log(change[t]);
    const next = new Float64Array(S);
    for (let k = 0; k < K; k++) {
      const inKey = bestInKey[k];
      const otherKey = bestInKey[first === k ? second : first];
      for (let c = 0; c < C; c++) {
        const s = k * C + c;
        const p = prior[s];
        let from = s;
        let value = score[s] + logStay;
        const moved = score[inKey] + logMove + p;
        if (inKey !== s && moved > value) {
          value = moved;
          from = inKey;
        }
        const newKey = score[otherKey] + logNewKey + p;
        if (newKey > value) {
          value = newKey;
          from = otherKey;
        }
        next[s] = value + emission[t * C + c];
        back[t * S + s] = from;
      }
    }
    score = next;
  }

  const path = new Uint16Array(T);
  let last = 0;
  for (let s = 1; s < S; s++) if (score[s] > score[last]) last = s;
  path[T - 1] = last;
  for (let t = T - 1; t > 0; t--) path[t - 1] = back[t * S + path[t]];

  const keyPath = Array.from(path, (s) => Math.floor(s / C));
  const chordPath = Array.from(path, (s) => s % C);
  resolveRelativeKeys(keyPath, chordPath, keyList, chordList);

  const segments: Segment[] = [];
  for (let t = 0; t < T; t++) {
    const key = keyList[keyPath[t]];
    const { chord } = chordList[chordPath[t]];
    const previous = segments[segments.length - 1];
    if (previous && previous.chord === chord && previous.key === key) {
      previous.end = (t + 1) * frameSeconds;
    } else {
      segments.push({ start: t * frameSeconds, end: (t + 1) * frameSeconds, chord, name: chord ? spellChord(chord, key) : 'N', key });
    }
  }
  return segments;
}

/**
 * A major key and its relative minor (G and Em) have the same chords, so
 * the model can't tell them apart. For each stretch in one key, pick the one
 * whose tonic chord is heard longer: G 80 s against Em 20 s is G major. A
 * tie goes to the major key, which is far more common.
 */
function resolveRelativeKeys(keyPath: number[], chordPath: number[], keyList: Key[], chordList: State[]) {
  const tonicTime = (key: Key, from: number, to: number) => {
    let frames = 0;
    for (let t = from; t < to; t++) {
      const { chord } = chordList[chordPath[t]];
      if (chord && chord.root === key.tonic && (chord.quality === 'min') === key.minor) frames++;
    }
    return frames;
  };
  for (let start = 0; start < keyPath.length; ) {
    let end = start;
    while (end < keyPath.length && keyPath[end] === keyPath[start]) end++;
    const key = keyList[keyPath[start]];
    const relative = keyList.findIndex((k) =>
      key.minor ? !k.minor && k.tonic === (key.tonic + 3) % 12 : k.minor && k.tonic === (key.tonic + 9) % 12);
    const relativeTime = tonicTime(keyList[relative], start, end);
    const ownTime = tonicTime(key, start, end);
    if (relativeTime > ownTime || (relativeTime === ownTime && key.minor)) keyPath.fill(relative, start, end);
    start = end;
  }
}
