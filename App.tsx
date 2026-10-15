import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TunerScreen } from './src/screens/TunerScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <TunerScreen />
    </SafeAreaProvider>
  );
}
