import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

/** Shown when microphone access has been denied. */
export function PermissionPrompt({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.permission}>
      <Text style={styles.title}>Microphone access needed</Text>
      <Text style={styles.body}>
        The tuner listens to your instrument through the microphone. Nothing is recorded or stored.
      </Text>
      <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
        <Text style={styles.buttonText}>Open Settings</Text>
      </Pressable>
      <Pressable onPress={onRetry}>
        <Text style={styles.retry}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.inTune,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  retry: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    padding: 8,
  },
});
