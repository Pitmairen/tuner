import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HistoryEntry } from '../chords/songFollower';
import { colors } from '../theme';

type Props = {
  history: HistoryEntry[];
  /** True while the newest entry is the chord still sounding. */
  live: boolean;
  onClear: () => void;
  /** Tapping a chord, e.g. to show its diagram; omit to make chips plain. */
  onSelect?: (entry: HistoryEntry) => void;
};

/** The chords played so far, newest on the right, following along as you play. */
export function ChordHistory({ history, live, onClear, onSelect }: Props) {
  const scroll = useRef<ScrollView>(null);

  // Keep the newest chord in view.
  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [history.length]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.caption}>Played</Text>
        {history.length > 0 && (
          <Pressable onPress={onClear} hitSlop={10} accessibilityLabel="Clear chord history">
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        )}
      </View>
      {history.length === 0 ? (
        <Text style={styles.empty}>Chords you play will appear here</Text>
      ) : (
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          accessibilityLabel={`Chords played: ${history.map((h) => h.name).join(', ')}`}
        >
          {history.map((entry, i) => {
            const current = live && i === history.length - 1;
            return (
              <Pressable
                key={`${entry.start}-${entry.name}`}
                onPress={onSelect ? () => onSelect(entry) : undefined}
                disabled={!onSelect}
                style={({ pressed }) => [styles.chip, current && styles.chipCurrent, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.chipText, current && styles.chipTextCurrent]}>{entry.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  clear: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    color: colors.faint,
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 20,
    height: 40,
    lineHeight: 40,
  },
  row: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    height: 40,
    minWidth: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCurrent: {
    borderColor: colors.inTune,
    backgroundColor: 'rgba(77, 242, 176, 0.1)',
  },
  chipText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  chipTextCurrent: {
    color: colors.inTune,
  },
});
