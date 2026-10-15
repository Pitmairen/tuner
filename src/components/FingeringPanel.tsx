import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chord } from '../chords/chords';
import { findFingerings, FretInstrument, rankByHeard } from '../chords/fingerings';
import { colors } from '../theme';
import { ChordDiagram, DIAGRAM_HEIGHT, diagramWidth } from './ChordDiagram';

/** Candidates considered when matching the notes heard; the best few are shown. */
const CANDIDATES = 12;
const SHOWN = 3;

type Props = {
  chord: Chord;
  /** MIDI notes heard when the chord was recognised. */
  heard: number[];
  instrument: FretInstrument;
  color: string;
};

/**
 * "How to play it": a chord diagram for the recognised chord, preferring the
 * shape that matches the notes heard. Mount with `key` = chord name and
 * instrument so the shapes are worked out once per chord rather than
 * shuffling as it rings.
 */
export function FingeringPanel({ chord, heard, instrument, color }: Props) {
  const [shapes] = useState(() =>
    rankByHeard(findFingerings(chord, instrument, CANDIDATES), heard, instrument).slice(0, SHOWN),
  );
  const [index, setIndex] = useState(0);

  if (shapes.length === 0) {
    return (
      <View style={[styles.container, { height: DIAGRAM_HEIGHT + 32 }]}>
        <Text style={styles.caption}>No {instrument.name.toLowerCase()} shape found</Text>
      </View>
    );
  }

  const step = (delta: number) => {
    Haptics.selectionAsync();
    setIndex((i) => (i + delta + shapes.length) % shapes.length);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { width: Math.max(diagramWidth(instrument.tuning.length) + 40, 200) }]}>
        <Text style={styles.caption}>How to play it · {instrument.name.toLowerCase()}</Text>
        {shapes.length > 1 && (
          <View style={styles.switcher}>
            <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityLabel="Previous shape">
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            <Text style={styles.count}>
              {index + 1}/{shapes.length}
            </Text>
            <Pressable onPress={() => step(1)} hitSlop={10} accessibilityLabel="Next shape">
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>
        )}
      </View>
      <ChordDiagram fingering={shapes[index]} instrument={instrument} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrow: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  count: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
