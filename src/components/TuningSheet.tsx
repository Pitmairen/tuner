import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import { DEFAULT_A4, MAX_A4, MIN_A4, pitchClass } from '../tuner/notes';
import { Tuning, TuningString, TUNINGS } from '../tuner/tunings';
import { TuningEditor } from './TuningEditor';

type Props = {
  visible: boolean;
  selected: Tuning;
  a4: number;
  onA4Change: (a4: number) => void;
  customTunings: Tuning[];
  onSelect: (tuning: Tuning) => void;
  onSaveCustom: (tuning: Tuning) => void;
  onDeleteCustom: (id: string) => void;
  onPlay: (string: TuningString) => void;
  onClose: () => void;
};

export function TuningSheet({
  visible,
  selected,
  a4,
  onA4Change,
  customTunings,
  onSelect,
  onSaveCustom,
  onDeleteCustom,
  onPlay,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<{ tuning: Tuning; isNew: boolean } | null>(null);

  const close = () => {
    setEditing(null);
    onClose();
  };

  const renderItem = (tuning: Tuning) => {
    const isSelected = tuning.id === selected.id;
    return (
      <Pressable
        key={tuning.id}
        onPress={() => onSelect(tuning)}
        style={({ pressed }) => [styles.item, isSelected && styles.itemSelected, pressed && styles.itemPressed]}
      >
        <View style={styles.itemText}>
          <Text style={styles.itemName} numberOfLines={1}>
            {tuning.name}
          </Text>
          <Text style={styles.itemNotes}>{tuning.notes.map(pitchClass).join('  ')}</Text>
        </View>
        {tuning.custom && (
          <Pressable
            onPress={() => setEditing({ tuning, isNew: false })}
            hitSlop={8}
            accessibilityLabel={`Edit ${tuning.name}`}
            style={({ pressed }) => [styles.edit, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        )}
        <View style={[styles.radio, isSelected && styles.radioSelected]} />
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={editing ? () => setEditing(null) : close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          {editing ? (
            <TuningEditor
              key={editing.tuning.id}
              initial={editing.tuning}
              isNew={editing.isNew}
              a4={a4}
              onPlay={onPlay}
              onCancel={() => setEditing(null)}
              onSave={(tuning) => {
                onSaveCustom(tuning);
                setEditing(null);
                onSelect(tuning);
              }}
              onDelete={
                editing.isNew
                  ? undefined
                  : () => {
                      onDeleteCustom(editing.tuning.id);
                      setEditing(null);
                    }
              }
            />
          ) : (
            <>
              <Text style={styles.title}>Choose tuning</Text>
              <ScrollView contentContainerStyle={styles.list}>
                <ReferencePitch a4={a4} onChange={onA4Change} />

                {TUNINGS.map(renderItem)}

                <Text style={styles.section}>Custom</Text>
                {customTunings.map(renderItem)}
                <Pressable
                  onPress={() => setEditing({ tuning: selected, isNew: true })}
                  style={({ pressed }) => [styles.create, pressed && styles.itemPressed]}
                >
                  <Text style={styles.createPlus}>+</Text>
                  <View style={styles.itemText}>
                    <Text style={styles.createText}>New custom tuning</Text>
                    <Text style={styles.itemNotes}>Starts from {selected.name}</Text>
                  </View>
                </Pressable>
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    <View style={styles.reference}>
      <View style={styles.itemText}>
        <Text style={styles.itemName}>Reference pitch</Text>
        {isDefault ? (
          <Text style={styles.itemNotes}>Standard concert pitch</Text>
        ) : (
          <Pressable onPress={() => onChange(DEFAULT_A4)} hitSlop={8}>
            <Text style={styles.reset}>Reset to {DEFAULT_A4} Hz</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => step(-1)}
        disabled={a4 <= MIN_A4}
        accessibilityLabel="Lower reference pitch"
        style={({ pressed }) => [styles.step, a4 <= MIN_A4 && styles.disabled, pressed && styles.itemPressed]}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <View style={styles.a4Value} accessibilityLabel={`A4 equals ${a4} hertz`}>
        <Text style={[styles.a4Number, !isDefault && styles.a4Changed]}>{a4}</Text>
        <Text style={styles.a4Unit}>A4 · Hz</Text>
      </View>
      <Pressable
        onPress={() => step(1)}
        disabled={a4 >= MAX_A4}
        accessibilityLabel="Raise reference pitch"
        style={({ pressed }) => [styles.step, a4 >= MAX_A4 && styles.disabled, pressed && styles.itemPressed]}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  reference: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: colors.background,
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
  a4Value: {
    width: 56,
    alignItems: 'center',
  },
  a4Number: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  a4Changed: {
    color: colors.close,
  },
  a4Unit: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.faint,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 16,
  },
  itemSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  itemNotes: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1,
  },
  section: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  edit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
  },
  editText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginTop: 4,
  },
  createPlus: {
    color: colors.inTune,
    fontSize: 24,
    fontWeight: '500',
    width: 22,
    textAlign: 'center',
  },
  createText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.faint,
  },
  radioSelected: {
    borderWidth: 7,
    borderColor: colors.inTune,
  },
});
