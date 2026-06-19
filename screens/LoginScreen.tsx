// screens/LoginScreen.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from 'lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('premium@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <View className="flex-1 justify-center gap-3 px-6">
      <Text className="mb-2 text-2xl font-bold">Sign in</Text>

      <TextInput
        testID="email-input"
        className="rounded-lg border border-gray-300 px-4 py-3"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password-input"
        className="rounded-lg border border-gray-300 px-4 py-3"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text className="text-red-600">{error}</Text>}

      <Pressable
        testID="signin-button"
        className="mt-2 items-center rounded-lg bg-blue-600 px-4 py-3 active:opacity-80"
        onPress={onSignIn}
        disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Sign in</Text>}
      </Pressable>
    </View>
  );
}