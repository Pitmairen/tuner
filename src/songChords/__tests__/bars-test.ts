import { chordName } from '../../chords/chords';
import { BarOptions, chordBars } from '../bars';
import { Segment } from '../chordModel';

const KEY = { tonic: 7, minor: false, name: 'G' };
const BEAT = 0.5;

/** Segments from a beat-by-beat chord list ("G G C D"), starting at time 0. */
function beatsAndSegments(perBeat: string[]) {
  const roots: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const beats = perBeat.map((_, i) => i * BEAT);
  const segments: Segment[] = [];
  perBeat.forEach((name, i) => {
    const previous = segments[segments.length - 1];
    if (previous && previous.name === name) {
      previous.end += BEAT;
      return;
    }
    const minor = name.endsWith('m');
    const chord = { root: roots[name[0]], quality: minor ? ('min' as const) : ('maj' as const), bass: roots[name[0]] };
    segments.push({ start: i * BEAT, end: (i + 1) * BEAT, chord, name: chordName(chord), key: KEY });
  });
  return { beats, segments };
}

/** The chart as text: "| G | C D |". */
function sheet(perBeat: string[], options?: BarOptions) {
  const { beats, segments } = beatsAndSegments(perBeat);
  const chart = chordBars(beats, segments, options);
  return {
    beatsPerBar: chart.beatsPerBar,
    text: chart.bars.map((bar) => bar.chords.map((c) => (c.chord ? chordName(c.chord) : '-')).join(' ')).join(' | '),
  };
}

const bar = (...chords: string[]) => (chords.length === 1 ? Array(4).fill(chords[0]) : chords.flatMap((c) => [c, c]));

describe('chordBars', () => {
  it('writes a chord sheet in 4/4', () => {
    // | G | C D |, eight times.
    const perBeat = Array.from({ length: 8 }, () => [...bar('G'), ...bar('C', 'D')]).flat();
    const { beatsPerBar, text } = sheet(perBeat);
    expect(beatsPerBar).toBe(4);
    expect(text.startsWith('G | C D | G | C D')).toBe(true);
  });

  it('follows an extra half bar instead of shifting every later bar', () => {
    // Four rounds of | G | C D |, then two extra beats of D, then four more rounds.
    const round = [...bar('G'), ...bar('C', 'D')];
    const perBeat = [...Array(4).fill(round).flat(), 'D', 'D', ...Array(4).fill(round).flat()];
    const { text } = sheet(perBeat);
    // After the short bar, the bars still start on G.
    expect(text.endsWith('G | C D | G | C D | G | C D')).toBe(true);
  });

  it('recognises 3/4', () => {
    // A waltz: one chord per bar of three beats.
    const perBeat = Array.from({ length: 8 }, () => ['G', 'G', 'G', 'C', 'C', 'C', 'D', 'D', 'D', 'G', 'G', 'G']).flat();
    expect(sheet(perBeat).beatsPerBar).toBe(3);
  });

  it('writes a chord again when it carries into the next bar', () => {
    const perBeat = Array.from({ length: 4 }, () => [...bar('G'), ...bar('G'), ...bar('Em', 'C')]).flat();
    expect(sheet(perBeat).text.startsWith('G | G | Em C')).toBe(true);
  });

  // | G | C D |, four times, with something odd in the second bar of each.
  const withSecondBar = (second: string[]) => Array.from({ length: 4 }, () => [...bar('G'), ...second]).flat();

  it('leaves out a one-beat chord between two of one root', () => {
    // D E D D: the E comes and goes within a beat.
    expect(sheet(withSecondBar(['D', 'E', 'D', 'D'])).text.startsWith('G | D | G | D')).toBe(true);
  });

  it('keeps a one-beat chord between two different chords', () => {
    // C E D D: can't tell which way the E belongs, so it stays.
    expect(sheet(withSecondBar(['C', 'E', 'D', 'D'])).text.startsWith('G | C E D | G | C E D')).toBe(true);
  });

  it('settles a major/minor flip within a bar', () => {
    // E Em E E: the third wasn't clear; E is heard on more beats.
    expect(sheet(withSecondBar(['E', 'Em', 'E', 'E'])).text.startsWith('G | E | G | E')).toBe(true);
  });

  it('keeps everything as heard without simplify', () => {
    const text = sheet(withSecondBar(['D', 'E', 'D', 'D']), { simplify: false }).text;
    expect(text.startsWith('G | D E D | G | D E D')).toBe(true);
  });
});
