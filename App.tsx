// App.tsx
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';
import { useAuth } from 'lib/useAuth';
import { LoginScreen } from 'screens/LoginScreen';
import { FlagsScreen } from 'screens/FlagsScreen';

export default function App() {
  const { session, loading } = useAuth();

  return (
    <SafeAreaProvider>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : session ? (
        <FlagsScreen email={session.user.email} />
      ) : (
        <LoginScreen />
      )}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}