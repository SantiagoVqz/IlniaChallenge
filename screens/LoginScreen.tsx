// screens/LoginScreen.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from 'lib/supabase';
import { EnvBadge } from 'components/EnvBadge';

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
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-1 justify-center px-6">
        <View className="mb-6 items-center gap-3">
          <EnvBadge />
          <Text className="text-3xl font-extrabold text-gray-900">Feature Flags</Text>
          <Text className="text-center text-gray-500">
            Sign in to see the flags your account is entitled to.
          </Text>
        </View>

        <View className="gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <View className="gap-1.5">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</Text>
            <TextInput
              testID="email-input"
              className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900"
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">Password</Text>
            <TextInput
              testID="password-input"
              className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900"
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {error && (
            <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text testID="login-error" className="text-sm text-red-700">{error}</Text>
            </View>
          )}

          <Pressable
            testID="signin-button"
            className="mt-1 items-center rounded-xl bg-blue-600 px-4 py-3.5 active:opacity-80 disabled:opacity-60"
            onPress={onSignIn}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">Sign in</Text>
            )}
          </Pressable>
        </View>

        <Text className="mt-6 text-center text-xs text-gray-400">
          Demo users (password123): free · premium · beta · suspended @example.com
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
