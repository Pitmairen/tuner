import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme';
import { midiToFrequency, noteName, parseNote } from '../tuner/notes';
import { instrument, Tuning, TuningString } from '../tuner/tunings';
import { SpeakerIcon } from './icons';

type Props = {
  /** The tuning to edit, or the starting point for a new one. */
  initial: Tuning;
  isNew: boolean;
  a4: number;
  onSave: (tuning: Tuning) => void;
  onDelete?: () => void;
  onCancel: () => void;
  onPlay: (string: TuningString) => void;
};

export function TuningEditor({ initial, isNew, a4, onSave, onDelete, onCancel, onPlay }: Props) {
  const [name, setName] = useState(isNew ? '' : initial.name);
  const [midis, setMidis] = useState(() => initial.notes.map(parseNote));
  const trimmedName = name.trim();
  // A tuning keeps its instrument (and so its string count and note range).
  const { minMidi, maxMidi, name: instrumentName } = instrument(initial.instrument);

  const toNote = (midi: number) => {
    const { name: pitch, octave } = noteName(midi);
    return `${pitch}${octave}`;
  };

  const step = (index: number, delta: number) => {
    const next = midis[index] + delta;
    if (next < minMidi || next > maxMidi) return;
    Haptics.selectionAsync();
    setMidis(midis.map((m, i) => (i === index ? next : m)));
  };

  const confirmDelete = () => {
    if (!onDelete) return;
    Alert.alert(`Delete “${initial.name}”?`, 'This custom tuning will be removed. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const save = () => {
    if (!trimmedName) return;
    onSave({
      id: isNew ? `custom-${Date.now()}` : initial.id,
      name: trimmedName,
      instrument: initial.instrument,
      notes: midis.map(toNote),
      custom: true,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.headerButton}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>{isNew ? `New ${instrumentName.toLowerCase()} tuning` : 'Edit tuning'}</Text>
        <Pressable onPress={save} disabled={!trimmedName} hitSlop={10}>
          <Text style={[styles.headerButton, styles.save, !trimmedName && styles.disabled]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name, e.g. Open D minor"
          placeholderTextColor={colors.faint}
          style={styles.input}
          maxLength={32}
          returnKeyType="done"
          autoFocus={isNew}
        />

        {midis.map((midi, index) => {
          const note = toNote(midi);
          const frequency = midiToFrequency(midi, a4);
          return (
            <View key={index} style={styles.row}>
              <Text style={styles.stringNumber}>{midis.length - index}</Text>
              <StepButton label="−" onPress={() => step(index, -1)} disabled={midi <= minMidi} />
              <View style={styles.noteBox}>
                <Text style={styles.note}>{note}</Text>
                <Text style={styles.frequency}>{frequency.toFixed(1)} Hz</Text>
              </View>
              <StepButton label="+" onPress={() => step(index, 1)} disabled={midi >= maxMidi} />
              <Pressable
                onPress={() => onPlay({ note, midi, frequency })}
                accessibilityLabel={`Play ${note}`}
                hitSlop={6}
                style={({ pressed }) => [styles.play, pressed && { opacity: 0.6 }]}
              >
                <SpeakerIcon color={colors.inTune} size={16} />
              </Pressable>
            </View>
          );
        })}

        {onDelete && (
          <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}>
            <Text style={styles.deleteText}>Delete tuning</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label === '+' ? 'Up a semitone' : 'Down a semitone'}
      style={({ pressed }) => [styles.step, disabled && styles.disabled, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  headerButton: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  save: {
    color: colors.inTune,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    gap: 8,
  },
  input: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  stringNumber: {
    width: 16,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
  noteBox: {
    flex: 1,
    alignItems: 'center',
  },
  note: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  frequency: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(77, 242, 176, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  delete: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  deleteText: {
    color: colors.off,
    fontSize: 15,
    fontWeight: '600',
  },
});
