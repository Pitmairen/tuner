import { StyleSheet, Text, View } from 'react-native';

import { FretInstrument } from '../chords/fingerings';
import { HistoryEntry } from '../chords/songFollower';
import { colors } from '../theme';
import { BottomSheet } from './BottomSheet';
import { FingeringPanel } from './FingeringPanel';

type Props = {
  /** The chord to show, or null when closed. */
  entry: HistoryEntry | null;
  instrument: FretInstrument | null;
  onClose: () => void;
};

/** A chord from the history, with its diagram. */
export function ChordDiagramSheet({ entry, instrument, onClose }: Props) {
  return (
    <BottomSheet visible={entry != null} onClose={onClose}>
      {entry && instrument && (
        <View style={styles.content}>
          <Text style={styles.name}>{entry.name}</Text>
          <FingeringPanel
            key={`${instrument.id}:${entry.name}`}
            chord={entry.chord}
            heard={[]}
            instrument={instrument}
            color={colors.inTune}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  name: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '800',
  },
});
