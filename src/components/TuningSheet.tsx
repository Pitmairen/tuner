import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { pitchClass } from '../tuner/notes';
import { CHORD_ID, CHROMATIC_ID, InstrumentId, INSTRUMENTS, Tuning, TuningString, TUNINGS } from '../tuner/tunings';
import { BottomSheet } from './BottomSheet';
import { TuningEditor } from './TuningEditor';

type Props = {
  visible: boolean;
  /** A tuning id, or CHROMATIC_ID. */
  selectedId: string;
  /** Which instrument's tunings are listed. */
  instrumentTab: InstrumentId;
  onInstrumentTabChange: (id: InstrumentId) => void;
  /** For the custom tuning editor's frequencies. */
  a4: number;
  customTunings: Tuning[];
  onSelect: (id: string) => void;
  onSaveCustom: (tuning: Tuning) => void;
  onDeleteCustom: (id: string) => void;
  onPlay: (string: TuningString) => void;
  onClose: () => void;
};

export function TuningSheet({
  visible,
  selectedId,
  instrumentTab,
  onInstrumentTabChange,
  a4,
  customTunings,
  onSelect,
  onSaveCustom,
  onDeleteCustom,
  onPlay,
  onClose,
}: Props) {
  const [editing, setEditing] = useState<{ tuning: Tuning; isNew: boolean } | null>(null);

  const close = () => {
    setEditing(null);
    onClose();
  };

  const builtIn = TUNINGS.filter((t) => t.instrument === instrumentTab);
  const custom = customTunings.filter((t) => t.instrument === instrumentTab);
  // A new custom tuning copies the selected one when it's on this instrument.
  const baseTuning = [...builtIn, ...custom].find((t) => t.id === selectedId) ?? builtIn[0];

  /** Chromatic and Chord: modes rather than tunings, listed above the instruments. */
  const renderMode = (id: string, name: string, description: string) => (
    <Pressable
      key={id}
      onPress={() => onSelect(id)}
      style={({ pressed }) => [styles.item, selectedId === id && styles.itemSelected, pressed && styles.itemPressed]}
    >
      <View style={styles.itemText}>
        <Text style={styles.itemName}>{name}</Text>
        <Text style={styles.itemNotes}>{description}</Text>
      </View>
      <View style={[styles.radio, selectedId === id && styles.radioSelected]} />
    </Pressable>
  );

  const renderItem = (tuning: Tuning) => {
    const isSelected = tuning.id === selectedId;
    return (
      <Pressable
        key={tuning.id}
        onPress={() => onSelect(tuning.id)}
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
    <BottomSheet visible={visible} onClose={close} onRequestClose={editing ? () => setEditing(null) : close}>
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
            onSelect(tuning.id);
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
            {renderMode(CHROMATIC_ID, 'Chromatic', 'Any note · no fixed strings')}
            {renderMode(CHORD_ID, 'Chord', 'Strum a chord to name it')}

            <InstrumentTabs selected={instrumentTab} onChange={onInstrumentTabChange} />

            {builtIn.map(renderItem)}

            <Text style={styles.section}>Custom</Text>
            {custom.map(renderItem)}
            <Pressable
              onPress={() => setEditing({ tuning: baseTuning, isNew: true })}
              style={({ pressed }) => [styles.create, pressed && styles.itemPressed]}
            >
              <Text style={styles.createPlus}>+</Text>
              <View style={styles.itemText}>
                <Text style={styles.createText}>New custom tuning</Text>
                <Text style={styles.itemNotes}>Starts from {baseTuning.name}</Text>
              </View>
            </Pressable>
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

function InstrumentTabs({ selected, onChange }: { selected: InstrumentId; onChange: (id: InstrumentId) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {INSTRUMENTS.map(({ id, name }) => {
        const active = id === selected;
        return (
          <Pressable
            key={id}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    padding: 4,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.surfaceRaised,
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '700',
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
