// screens/FlagsScreen.tsx
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from 'lib/supabase';
import { EnvBadge } from 'components/EnvBadge';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

type Flag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  min_tier: string;
};

const TIER_STYLE: Record<string, { box: string; text: string }> = {
  free: { box: 'bg-gray-100', text: 'text-gray-600' },
  premium: { box: 'bg-indigo-100', text: 'text-indigo-700' },
  beta: { box: 'bg-purple-100', text: 'text-purple-700' },
};
const TIER_FALLBACK = { box: 'bg-gray-100', text: 'text-gray-600' };

export function FlagsScreen({ email }: { email?: string }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError('No active session. Please sign in again.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/flags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = await res.json();
      setFlags(body.flags ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags('initial');
  }, [fetchFlags]);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="border-b border-gray-200 bg-white px-6 pb-4 pt-16">
        <View className="mb-3 flex-row items-center justify-between">
          <EnvBadge />
          <Pressable
            testID="signout-button"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 active:opacity-70"
            onPress={() => supabase.auth.signOut()}>
            <Text className="text-sm font-medium text-gray-700">Sign out</Text>
          </Pressable>
        </View>
        <Text className="text-2xl font-extrabold text-gray-900">Feature Flags</Text>
        {email && <Text className="mt-0.5 text-sm text-gray-500">{email}</Text>}
        {!loading && !error && (
          <Text className="mt-1 text-xs text-gray-400">
            {flags.length} flag{flags.length === 1 ? '' : 's'} available to this account
          </Text>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="mt-2 text-sm text-gray-400">Loading flags…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text testID="flags-error" className="mb-3 text-center text-red-600">{error}</Text>
          <Pressable
            testID="retry-button"
            className="rounded-xl bg-blue-600 px-4 py-2.5 active:opacity-80"
            onPress={() => fetchFlags('initial')}>
            <Text className="font-semibold text-white">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="flags-list"
          data={flags}
          keyExtractor={(f) => f.id}
          contentContainerClassName="px-6 py-4"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchFlags('refresh')} />
          }
          ListEmptyComponent={
            <View className="items-center px-6 py-20">
              <Text className="text-center text-base font-medium text-gray-700">No flags available</Text>
              <Text className="mt-1 text-center text-sm text-gray-400">
                This account isn’t entitled to any feature flags in this environment.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              testID={`flag-${item.key}`}
              className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-base font-semibold text-gray-900">{item.name}</Text>
                <View
                  className={`rounded-full px-2 py-0.5 ${item.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Text
                    className={`text-[11px] font-bold uppercase tracking-wide ${item.enabled ? 'text-green-700' : 'text-gray-500'}`}>
                    {item.enabled ? 'On' : 'Off'}
                  </Text>
                </View>
              </View>

              {item.description && (
                <Text className="mb-2 text-sm leading-5 text-gray-600">{item.description}</Text>
              )}

              <View className="flex-row items-center gap-2">
                <View className="rounded-md bg-gray-100 px-2 py-0.5">
                  <Text className="font-mono text-[11px] text-gray-500">{item.key}</Text>
                </View>
                <View className={`rounded-md px-2 py-0.5 ${(TIER_STYLE[item.min_tier] ?? TIER_FALLBACK).box}`}>
                  <Text className={`text-[11px] font-medium ${(TIER_STYLE[item.min_tier] ?? TIER_FALLBACK).text}`}>
                    min tier: {item.min_tier}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
