import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { centsColor, colors } from '../theme';
import { noteHint } from '../tuner/hint';
import { pitchClass } from '../tuner/notes';
import { Steadiness } from '../tuner/steadiness';
import { TuningString } from '../tuner/tunings';
import { IN_TUNE_CENTS, TunerReading } from '../tuner/useTuner';
import { Gauge } from './Gauge';
import { MicOffIcon } from './icons';
import { TunedBanner } from './TunedBanner';

type Props = {
  reading: TunerReading | null;
  /** What to show when nothing is heard: the reference note playing or the locked string. */
  idleTarget: TuningString | null;
  /** A reference note is playing, so the tuner isn't listening. */
  paused: boolean;
  chromatic: boolean;
  steadiness: Steadiness;
  /** Changes when every string has just been tuned. */
  celebration: number;
  stringCount: number;
};

/** The gauge, note and status for tuning (tuner and chromatic modes). */
export function TuningReadout({ reading, idleTarget, paused, chromatic, steadiness, celebration, stringCount }: Props) {
  const { width } = useWindowDimensions();
  const cents = reading?.cents ?? null;
  const target = reading ? reading.target : idleTarget;
  const accent = centsColor(cents);
  // Chromatic mode already shows the played note, so it needs no hint.
  const hint = reading && !chromatic && !paused ? noteHint(reading.cents, reading.playing, reading.target.note) : null;

  return (
    <View style={styles.main}>
      <TunedBanner trigger={celebration} stringCount={stringCount} />
      <Gauge cents={cents} size={Math.min(width - 40, 380)} paused={paused} steadiness={steadiness} />

      <View style={styles.readout}>
        <View style={styles.noteRow}>
          <Text style={[styles.note, { color: reading ? colors.text : paused ? colors.muted : colors.faint }]}>
            {target ? pitchClass(target.note) : '–'}
          </Text>
          {target && <Text style={styles.octave}>{target.note.match(/\d+$/)?.[0]}</Text>}
        </View>
        <Text style={styles.detail}>
          {paused && target
            ? `Reference · ${target.frequency.toFixed(1)} Hz`
            : reading
              ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(0)} cents · ${reading.frequency.toFixed(1)} Hz`
              : target
                ? `${target.frequency.toFixed(1)} Hz`
                : ' '}
        </Text>
        {/* Always rendered so the status pill doesn't move when a hint appears. */}
        <Text style={[styles.hint, hint?.kind === 'octave' && styles.hintOctave]} numberOfLines={1}>
          {hint?.text ?? ' '}
        </Text>
        {paused ? (
          <View style={[styles.status, styles.statusPaused]}>
            <MicOffIcon color={colors.muted} size={15} />
            <Text style={[styles.statusText, { color: colors.muted }]}>Tuner paused</Text>
          </View>
        ) : (
          <View style={[styles.status, { borderColor: accent, backgroundColor: reading ? `${accent}1A` : 'transparent' }]}>
            <Text style={[styles.statusText, { color: reading ? accent : colors.muted }]}>
              {hint?.kind === 'octave' ? 'Wrong octave' : statusLabel(cents, chromatic)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function statusLabel(cents: number | null, chromatic: boolean): string {
  if (cents == null) return chromatic ? 'Play a note' : 'Play a string';
  if (Math.abs(cents) <= IN_TUNE_CENTS) return 'In tune';
  return cents < 0 ? 'Tune up  ↑' : 'Tune down  ↓';
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  readout: {
    alignItems: 'center',
    gap: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  note: {
    fontSize: 104,
    lineHeight: 112,
    fontWeight: '800',
    letterSpacing: -3,
  },
  octave: {
    color: colors.muted,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
    marginLeft: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: -4,
  },
  hintOctave: {
    color: colors.close,
  },
  detail: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPaused: {
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
