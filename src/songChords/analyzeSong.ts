import { BarChart, BarOptions, chordBars } from './bars';
import { addBassNotes } from './bass';
import { harmonicChange, onsetStrength, trackBeats } from './beats';
import { recogniseChords, ModelOptions, Segment } from './chordModel';
import { ANALYSIS_RATE, chroma, estimateTuning, FRAME_SECONDS, harmonicPart, resample, spectrogram } from './frames';

export type SongAnalysis = {
  /** How far the recording is from A4 = 440 Hz, in cents. */
  tuningCents: number;
  /** Beat times in seconds, and the tempo. */
  beats: number[];
  bpm: number;
  segments: Segment[];
  /** The chords in bars, for a chord sheet. */
  chart: BarChart;
};

export type AnalysisOptions = ModelOptions & {
  /** Use the beats for when chords change (on by default). */
  followBeats?: boolean;
  /** Weight of harmonic change against note onsets when finding the beats. */
  harmonicWeight?: number;
  /** Name slash chords where the bass plays another note (on by default). */
  slashChords?: boolean;
  /** How the chart in bars is written. */
  chart?: BarOptions;
};

/**
 * Recognises the chords of a whole recording (mono samples at any rate;
 * ANALYSIS_RATE skips the resampling). `onProgress` gets 0-1 as it goes:
 * a few minutes of audio take seconds, longer on a phone.
 */
export function analyzeSong(
  samples: Float32Array,
  sampleRate: number,
  options: AnalysisOptions = {},
  onProgress: (fraction: number) => void = () => {},
): SongAnalysis {
  // Rough share of the time each step takes; removing the drums dominates.
  const signal = resample(samples, sampleRate, ANALYSIS_RATE);
  onProgress(sampleRate === ANALYSIS_RATE ? 0.02 : 0.1);
  const spec = spectrogram(signal);
  onProgress(0.2);
  const harmonic = harmonicPart(spec, (f) => onProgress(0.2 + 0.65 * f));
  const tuningCents = estimateTuning(harmonic);
  const frames = chroma(harmonic, tuningCents);
  // Beats from note onsets plus where the harmony changes.
  const onset = onsetStrength(spec, FRAME_SECONDS);
  const change = harmonicChange(frames, FRAME_SECONDS);
  const harmonicWeight = options.harmonicWeight ?? 2;
  const placement = onset.map((value, t) => value + harmonicWeight * change[t]);
  const beats = trackBeats(onset, FRAME_SECONDS, placement);
  onProgress(0.9);
  const chords = recogniseChords(frames, FRAME_SECONDS, options, options.followBeats === false ? undefined : beats.frames);
  const segments = options.slashChords === false ? chords : addBassNotes(chords, frames, FRAME_SECONDS, beats.frames);
  const beatTimes = beats.frames.map((t) => t * FRAME_SECONDS);
  onProgress(1);
  return { tuningCents, beats: beatTimes, bpm: beats.bpm, segments, chart: chordBars(beatTimes, segments, options.chart) };
}
