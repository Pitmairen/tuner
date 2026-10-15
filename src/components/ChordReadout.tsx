import { StyleSheet, Text, View } from 'react-native';

import { chordName, PITCH_NAMES } from '../chords/chords';
import { ChordResult, CLEAR_MATCH } from '../chords/detectChord';
import { colors } from '../theme';

type Props = {
  result: ChordResult | null;
};

/** Takes the gauge's place in chord mode: the chord name and the notes heard. */
export function ChordReadout({ result }: Props) {
  if (!result) {
    return (
      <View style={styles.container}>
        <Text style={[styles.name, styles.empty]}>–</Text>
        <Text style={styles.notes}> </Text>
        <View style={styles.status}>
          <Text style={[styles.statusText, { color: colors.muted }]}>Strum a chord</Text>
        </View>
      </View>
    );
  }

  const { chord, confidence, notes } = result;
  const confident = confidence >= CLEAR_MATCH;
  const accent = confident ? colors.inTune : colors.close;
  // Show the slash chord's bass separately so the main name stays big.
  const main = chordName({ ...chord, bass: chord.root });
  const heard = [...new Set(notes.map((n) => PITCH_NAMES[n.midi % 12]))].join(' · ');

  return (
    <View style={styles.container} accessibilityLiveRegion="polite" accessibilityLabel={`Chord ${result.name}`}>
      <View style={styles.nameRow}>
        <Text style={styles.name} adjustsFontSizeToFit numberOfLines={1}>
          {main}
        </Text>
        {chord.bass !== chord.root && <Text style={styles.bass}>/{PITCH_NAMES[chord.bass]}</Text>}
      </View>
      <Text style={styles.notes}>{heard}</Text>
      <View style={[styles.status, { borderColor: accent, backgroundColor: `${accent}1A` }]}>
        <Text style={[styles.statusText, { color: accent }]}>{confident ? 'Clear match' : 'Unsure'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  name: {
    color: colors.text,
    fontSize: 112,
    lineHeight: 124,
    fontWeight: '800',
    letterSpacing: -3,
  },
  empty: {
    color: colors.faint,
  },
  bass: {
    color: colors.muted,
    fontSize: 40,
    fontWeight: '700',
    marginBottom: 18,
    marginLeft: 4,
  },
  notes: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  status: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
