import {
  AudioStreamBuffer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { detectPitch } from './pitch';
import { PitchSmoother, Steadiness } from './steadiness';
import { Detection, WIDE_DETECTION } from './tunings';

export type PermissionState = 'unknown' | 'granted' | 'denied';

/** Holds the longest analysis window; shorter ones read its most recent samples. */
const RING_SIZE = WIDE_DETECTION.windowSize;
const ANALYSIS_INTERVAL_MS = 60;
/** How long to keep showing the last pitch after the string goes quiet. */
const HOLD_MS = 1200;
const MIN_CLARITY = 0.85;

/**
 * Streams the microphone and reports a smoothed fundamental frequency,
 * or null when nothing is being played. While `muted`, input is ignored.
 */
export function usePitch(muted: boolean, detection: Detection, steadiness: Steadiness) {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [frequency, setFrequency] = useState<number | null>(null);

  const ring = useRef(new Float32Array(RING_SIZE));
  const writeIndex = useRef(0);
  const filled = useRef(0);
  const lastAnalysis = useRef(0);
  const lastHeard = useRef(0);
  const [smoother] = useState(() => new PitchSmoother(steadiness));
  const mutedRef = useRef(muted);
  const detectionRef = useRef(detection);

  useEffect(() => {
    // Readings from the previous instrument's settings shouldn't be smoothed
    // together with the new ones.
    detectionRef.current = detection;
    smoother.reset();
  }, [detection, smoother]);

  useEffect(() => smoother.setSteadiness(steadiness), [smoother, steadiness]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      smoother.reset();
      filled.current = 0;
      lastHeard.current = 0;
    }
  }, [muted, smoother]);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (mutedRef.current) return;
    const samples = new Float32Array(buffer.data);
    const step = Math.max(1, buffer.channels);
    for (let i = 0; i < samples.length; i += step) {
      ring.current[writeIndex.current] = samples[i];
      writeIndex.current = (writeIndex.current + 1) % RING_SIZE;
    }
    filled.current = Math.min(RING_SIZE, filled.current + samples.length / step);

    const { windowSize, minFrequency, decimation } = detectionRef.current;
    const now = Date.now();
    if (filled.current < windowSize || now - lastAnalysis.current < ANALYSIS_INTERVAL_MS) return;
    lastAnalysis.current = now;

    const window = latest(ring.current, writeIndex.current, windowSize);
    const result = detectPitch(window, buffer.sampleRate, { minFrequency, decimation });
    if (result && result.clarity >= MIN_CLARITY) {
      lastHeard.current = now;
      setFrequency(smoother.push(result.frequency));
    } else if (now - lastHeard.current > HOLD_MS) {
      smoother.reset();
      setFrequency(null);
    }
  }, [smoother]);

  const { stream } = useAudioStream({ sampleRate: 48000, channels: 1, encoding: 'float32', onBuffer });

  // useAudioStream releases the stream on unmount (which also stops capture),
  // and its cleanup runs before ours. Any call on a released stream throws, so
  // only touch it while this is true, re-checking after every await.
  const streamUsable = useRef(false);

  const start = useCallback(async () => {
    try {
      const response = await requestRecordingPermissionsAsync();
      if (!streamUsable.current) return;
      setPermission(response.granted ? 'granted' : 'denied');
      if (!response.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (streamUsable.current && !stream.isStreaming) await stream.start();
    } catch (error) {
      console.warn('Could not start microphone', error);
    }
  }, [stream]);

  useEffect(() => {
    streamUsable.current = true;

    getRecordingPermissionsAsync().then((response) => {
      if (!streamUsable.current) return;
      if (response.granted || response.canAskAgain) start();
      else setPermission('denied');
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (!streamUsable.current) return;
      if (state === 'active') {
        start();
      } else if (stream.isStreaming) {
        stream.stop();
        smoother.reset();
        filled.current = 0;
        setFrequency(null);
      }
    });

    return () => {
      streamUsable.current = false;
      subscription.remove();
    };
  }, [start, stream, smoother]);

  return { frequency: muted ? null : frequency, permission, retry: start };
}

/** The most recent `length` samples of the ring, oldest first. */
function latest(ring: Float32Array, writeIndex: number, length: number): Float32Array {
  const out = new Float32Array(length);
  const start = (writeIndex - length + ring.length) % ring.length;
  if (start + length <= ring.length) {
    out.set(ring.subarray(start, start + length));
  } else {
    const head = ring.length - start;
    out.set(ring.subarray(start));
    out.set(ring.subarray(0, length - head), head);
  }
  return out;
}
