import { SongFollower } from '../songFollower';
import { synthesizeSong, SongOptions } from '../testing/song';
import { SAMPLE_RATE } from '../testing/synth';

const POP = [
  { shape: 'x32010', name: 'C' },
  { shape: '320003', name: 'G' },
  { shape: 'x02210', name: 'Am' },
  { shape: '133211', name: 'F' },
];
const FOLK = [
  { shape: '320003', name: 'G' },
  { shape: 'xx0232', name: 'D' },
  { shape: '022000', name: 'Em' },
  { shape: 'x32010', name: 'C' },
];
const SEVENTHS = [
  { shape: 'x02010', name: 'Am7' },
  { shape: 'xx0212', name: 'D7' },
  { shape: '022100', name: 'E' },
  { shape: 'x21202', name: 'B7' },
];

const ROCK = [
  { shape: '022xxx', name: 'E5' },
  { shape: 'x022xx', name: 'A5' },
  { shape: '355xxx', name: 'G5' },
  { shape: 'x577xx', name: 'D5' },
];

type Expect = {
  /** Minimum share of time showing the right chord (measured, minus slack). */
  accuracy: number;
  /** Maximum typical lag after a chord change, in seconds. */
  lag: number;
  /** How many entries the history may differ from the song's real sequence. */
  historyErrors: number;
};
const STRUMMED: Expect = { accuracy: 0.9, lag: 0.45, historyErrors: 1 };

const SONGS: { label: string; options: SongOptions; expect: Expect }[] = [
  { label: 'pop, 8ths, 100 bpm', options: { progression: POP, bpm: 100, beatsPerChord: 4, repeats: 2, style: 'eighths', seed: 1 }, expect: STRUMMED },
  { label: 'pop, quarters, 80 bpm', options: { progression: POP, bpm: 80, beatsPerChord: 4, repeats: 2, style: 'quarters', seed: 2 }, expect: STRUMMED },
  { label: 'pop, chucks, 100 bpm', options: { progression: POP, bpm: 100, beatsPerChord: 4, repeats: 2, style: 'chucks', seed: 3 }, expect: STRUMMED },
  { label: 'folk, fingerpicked, 90', options: { progression: FOLK, bpm: 90, beatsPerChord: 4, repeats: 2, style: 'fingerpicked', seed: 4 }, expect: { accuracy: 0.6, lag: 1.5, historyErrors: 3 } },
  { label: '7ths, 8ths, 120 bpm', options: { progression: SEVENTHS, bpm: 120, beatsPerChord: 4, repeats: 2, style: 'eighths', seed: 5 }, expect: STRUMMED },
  { label: 'rock power chords, 120', options: { progression: ROCK, bpm: 120, beatsPerChord: 4, repeats: 2, style: 'eighths', seed: 8 }, expect: { ...STRUMMED, accuracy: 0.85 } },
  { label: 'fast: 2 beats, 140', options: { progression: POP, bpm: 140, beatsPerChord: 2, repeats: 3, style: 'eighths', seed: 6 }, expect: STRUMMED },
  {
    label: 'noisy, out of tune',
    options: { progression: FOLK, bpm: 100, beatsPerChord: 4, repeats: 2, style: 'eighths', seed: 7, snrDb: 15, detuneCents: 12 },
    expect: STRUMMED,
  },
];

type Score = {
  label: string;
  /** Share of time the right chord was shown, after a short grace at each change. */
  accuracy: number;
  medianLag: number;
  maxLag: number;
  missed: number;
  /** Displayed chord changes beyond the song's real ones. */
  extraChanges: number;
  historyErrors: number;
  history: string;
};

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

/**
 * Plays a song through the follower in microphone-sized chunks and scores it.
 * As with the other chord tests, synthesized songs are an upper bound; real
 * guitars, rooms and phone mics will do worse.
 */
function score(label: string, options: SongOptions): Score {
  const { audio, truth } = synthesizeSong(options);
  const follower = new SongFollower(SAMPLE_RATE);
  const shown: { time: number; name: string | null }[] = [];
  const CHUNK = 1024;
  for (let i = 0; i < audio.length; i += CHUNK) {
    follower.push(audio.subarray(i, i + CHUNK));
    shown.push({ time: follower.time, name: follower.state.current?.name ?? null });
  }

  let right = 0;
  let counted = 0;
  const lags: number[] = [];
  let missed = 0;
  for (const { start, end, name } of truth) {
    const grace = Math.min(0.6, (end - start) / 2);
    const during = shown.filter((s) => s.time >= start && s.time < end);
    for (const s of during) {
      if (s.time < start + grace) continue;
      counted++;
      if (s.name === name) right++;
    }
    const firstRight = during.find((s) => s.name === name);
    if (firstRight) lags.push(firstRight.time - start);
    else missed++;
  }

  let changes = 0;
  for (let i = 1; i < shown.length; i++) if (shown[i].name && shown[i].name !== shown[i - 1].name) changes++;
  const trueChanges = truth.filter((t, i) => i === 0 || t.name !== truth[i - 1].name).length;
  const expectedHistory = truth.map((t) => t.name).filter((n, i, all) => i === 0 || n !== all[i - 1]);
  const history = follower.state.history.map((h) => h.name);
  lags.sort((a, b) => a - b);

  return {
    label,
    accuracy: right / counted,
    medianLag: lags[Math.floor(lags.length / 2)] ?? Infinity,
    maxLag: lags[lags.length - 1] ?? Infinity,
    missed,
    extraChanges: Math.max(0, changes - trueChanges),
    historyErrors: editDistance(history, expectedHistory),
    history: history.join(' '),
  };
}

describe('SongFollower on synthesized songs', () => {
  const scores = SONGS.map(({ label, options }) => score(label, options));

  afterAll(() => {
    const row = (s: Score) =>
      `${s.label.padEnd(24)} ${(100 * s.accuracy).toFixed(0).padStart(4)}%  lag ${s.medianLag.toFixed(2)}s / max ${s.maxLag.toFixed(2)}s  missed ${s.missed}  extra ${s.extraChanges}  history ${s.historyErrors === 0 ? 'ok' : `${s.historyErrors} off: ${s.history}`}`;
    console.log(`Song following\n${scores.map(row).join('\n')}`);
  });

  it.each(SONGS.map((s, i) => [s.label, i]))('%s', (_, i) => {
    const { expect: target } = SONGS[i as number];
    const s = scores[i as number];
    // Wrapped with the label so a failure names the song.
    expect({ song: s.label, missed: s.missed }).toEqual({ song: s.label, missed: 0 });
    expect({ song: s.label, accurate: s.accuracy >= target.accuracy }).toEqual({ song: s.label, accurate: true });
    expect({ song: s.label, quick: s.medianLag <= target.lag }).toEqual({ song: s.label, quick: true });
    expect({ song: s.label, history: s.historyErrors <= target.historyErrors }).toEqual({ song: s.label, history: true });
  });
});

describe('SongFollower basics', () => {
  /** Feeds audio in microphone-sized chunks; returns [time, shown chord] after each. */
  const play = (follower: SongFollower, audio: Float32Array) => {
    const shown: [number, string | null][] = [];
    for (let i = 0; i < audio.length; i += 1024) {
      follower.push(audio.subarray(i, i + 1024));
      shown.push([follower.time, follower.state.current?.name ?? null]);
    }
    return shown;
  };

  it('shows a single strum quickly, holds it, and clears after silence', () => {
    // One open C strum ringing for 2 s, then 2.5 s of silence.
    const { audio: strummed } = synthesizeSong({
      progression: [{ shape: 'x32010', name: 'C' }],
      bpm: 30, // one strum per 2 s chord
      beatsPerChord: 1,
      repeats: 1,
      style: 'quarters',
      seed: 9,
    });
    const audio = new Float32Array(SAMPLE_RATE * 4.5);
    audio.set(strummed.subarray(0, SAMPLE_RATE * 2));
    const shown = play(new SongFollower(SAMPLE_RATE), audio);
    const first = shown.find(([, name]) => name === 'C');
    expect(first?.[0]).toBeLessThan(0.35);
    expect(shown.filter(([t]) => t > 0.4 && t < 2).every(([, name]) => name === 'C')).toBe(true);
    expect(shown[shown.length - 1][1]).toBeNull();
  });

  it('clearHistory keeps only the chord still sounding', () => {
    const { audio } = synthesizeSong({ progression: POP, bpm: 100, beatsPerChord: 4, repeats: 1, style: 'eighths', seed: 10 });
    const follower = new SongFollower(SAMPLE_RATE);
    play(follower, audio.subarray(0, SAMPLE_RATE * 6));
    expect(follower.state.history.length).toBeGreaterThan(1);
    follower.clearHistory();
    expect(follower.state.history.map((h) => h.name)).toEqual([follower.state.current?.name]);
  });
});
