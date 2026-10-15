import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FRET_INSTRUMENTS, FretInstrumentId } from '../chords/fingerings';
import { colors } from '../theme';
import { DEFAULT_A4, MAX_A4, MIN_A4 } from '../tuner/notes';
import { Steadiness, STEADINESS_OPTIONS } from '../tuner/steadiness';
import { MAX_TRANSPOSE, MIN_TRANSPOSE } from '../tuner/tunings';
import { BottomSheet } from './BottomSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  a4: number;
  onA4Change: (a4: number) => void;
  steadiness: Steadiness;
  onSteadinessChange: (steadiness: Steadiness) => void;
  transpose: number;
  onTransposeChange: (transpose: number) => void;
  /** False in chromatic and chord modes, which have no strings to shift. */
  transposeApplies: boolean;
  fingering: FretInstrumentId | 'off';
  onFingeringChange: (fingering: FretInstrumentId | 'off') => void;
  /** Shares the last few seconds of microphone audio. */
  onShareClip: () => void;
};

export function SettingsSheet({
  visible,
  onClose,
  a4,
  onA4Change,
  steadiness,
  onSteadinessChange,
  transpose,
  onTransposeChange,
  transposeApplies,
  fingering,
  onFingeringChange,
  onShareClip,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Settings</Text>
      <ScrollView contentContainerStyle={styles.list}>
        <Transpose value={transpose} onChange={onTransposeChange} applies={transposeApplies} />
        <ReferencePitch a4={a4} onChange={onA4Change} />
        <NeedleSetting value={steadiness} onChange={onSteadinessChange} />
        <View style={styles.row}>
          <View style={styles.label}>
            <Text style={styles.name}>Show fingering</Text>
            <Text style={styles.description} numberOfLines={2}>
              Chord mode: a chord diagram for the chord heard
            </Text>
          </View>
          <Segmented
            options={[{ id: 'off', label: 'Off' }, ...FRET_INSTRUMENTS.map(({ id, name }) => ({ id, label: name }))]}
            value={fingering}
            onChange={onFingeringChange}
          />
        </View>

        <Text style={styles.section}>Help improve detection</Text>
        <View style={styles.row}>
          <View style={styles.label}>
            <Text style={styles.name}>Share last 10 seconds</Text>
            <Text style={styles.description}>
              If the tuner got something wrong, send the audio along with what you played.
            </Text>
          </View>
          <Pressable
            onPress={onShareClip}
            accessibilityLabel="Share the last 10 seconds of audio"
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}
          >
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

/** Capo / transpose: shifts every string's target by whole semitones. */
type TransposeProps = { value: number; onChange: (value: number) => void; applies: boolean };

function Transpose({ value, onChange, applies }: TransposeProps) {
  const step = (delta: number) => {
    const next = value + delta;
    if (next < MIN_TRANSPOSE || next > MAX_TRANSPOSE) return;
    Haptics.selectionAsync();
    onChange(next);
  };
  const semitones = (n: number) => `${n} semitone${n === 1 ? '' : 's'}`;
  const description = !applies
    ? 'Only applies to string tunings'
    : value === 0
      ? 'Off'
      : value > 0
        ? `Capo on fret ${value}`
        : `Strings ${semitones(-value)} lower`;

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={styles.name}>Capo / transpose</Text>
        <Text style={styles.description}>{description}</Text>
        {value !== 0 && (
          <Pressable onPress={() => onChange(0)} hitSlop={8}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        )}
      </View>
      <Stepper
        onStep={step}
        canDecrease={value > MIN_TRANSPOSE}
        canIncrease={value < MAX_TRANSPOSE}
        decreaseLabel="Transpose down a semitone"
        increaseLabel="Transpose up a semitone"
      >
        <View style={styles.value} accessibilityLabel={`Transpose ${value} semitones`}>
          <Text style={[styles.number, value !== 0 && styles.changed]}>
            {value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0'}
          </Text>
          <Text style={styles.unit}>semitones</Text>
        </View>
      </Stepper>
    </View>
  );
}

/** A4 calibration: the pitch every other note is derived from. */
function ReferencePitch({ a4, onChange }: { a4: number; onChange: (a4: number) => void }) {
  const step = (delta: number) => {
    const next = a4 + delta;
    if (next < MIN_A4 || next > MAX_A4) return;
    Haptics.selectionAsync();
    onChange(next);
  };
  const isDefault = a4 === DEFAULT_A4;

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={styles.name}>Reference pitch</Text>
        {isDefault ? (
          <Text style={styles.description}>Standard concert pitch</Text>
        ) : (
          <Pressable onPress={() => onChange(DEFAULT_A4)} hitSlop={8}>
            <Text style={styles.reset}>Reset to {DEFAULT_A4} Hz</Text>
          </Pressable>
        )}
      </View>
      <Stepper
        onStep={step}
        canDecrease={a4 > MIN_A4}
        canIncrease={a4 < MAX_A4}
        decreaseLabel="Lower reference pitch"
        increaseLabel="Raise reference pitch"
      >
        <View style={styles.value} accessibilityLabel={`A4 equals ${a4} hertz`}>
          <Text style={[styles.number, !isDefault && styles.changed]}>{a4}</Text>
          <Text style={styles.unit}>A4 · Hz</Text>
        </View>
      </Stepper>
    </View>
  );
}

/** How much the needle is smoothed: responsiveness versus calm. */
function NeedleSetting({ value, onChange }: { value: Steadiness; onChange: (value: Steadiness) => void }) {
  const current = STEADINESS_OPTIONS.find((o) => o.id === value) ?? STEADINESS_OPTIONS[1];
  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={styles.name}>Needle</Text>
        <Text style={styles.description} numberOfLines={2}>
          {current.description}
        </Text>
      </View>
      <Segmented options={STEADINESS_OPTIONS} value={value} onChange={onChange} />
    </View>
  );
}

type SegmentedProps<T extends string> = {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A compact one-of-several control. */
function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {options.map(({ id, label }) => {
        const active = id === value;
        return (
          <Pressable
            key={id}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type StepperProps = {
  onStep: (delta: number) => void;
  canDecrease: boolean;
  canIncrease: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  children: ReactNode;
};

/** − value + */
function Stepper({ onStep, canDecrease, canIncrease, decreaseLabel, increaseLabel, children }: StepperProps) {
  return (
    <>
      <Pressable
        onPress={() => onStep(-1)}
        disabled={!canDecrease}
        accessibilityLabel={decreaseLabel}
        style={({ pressed }) => [styles.step, !canDecrease && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      {children}
      <Pressable
        onPress={() => onStep(1)}
        disabled={!canIncrease}
        accessibilityLabel={increaseLabel}
        style={({ pressed }) => [styles.step, !canIncrease && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
    gap: 8,
  },
  section: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    marginTop: 12,
  },
  share: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  shareText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  label: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  reset: {
    color: colors.close,
    fontSize: 13,
    fontWeight: '600',
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
  value: {
    width: 64,
    alignItems: 'center',
  },
  number: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  changed: {
    color: colors.close,
  },
  unit: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  segments: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: colors.surfaceRaised,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
});
