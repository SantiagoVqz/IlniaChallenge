// screens/FlagsScreen.tsx
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from 'lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

type Flag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  min_tier: string;
};

export function FlagsScreen({ email }: { email?: string }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError('No session');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/flags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const body = await res.json();
      setFlags(body.flags ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  return (
    <View className="flex-1 px-6 pt-16">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold">Feature flags</Text>
          {email && <Text className="text-gray-500">{email}</Text>}
        </View>
        <Pressable
          testID="signout-button"
          className="rounded-lg bg-gray-200 px-3 py-2 active:opacity-80"
          onPress={() => supabase.auth.signOut()}>
          <Text className="font-medium">Sign out</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text className="text-red-600">{error}</Text>
      ) : (
        <FlatList
          testID="flags-list"
          data={flags}
          keyExtractor={(f) => f.id}
          ListEmptyComponent={<Text className="text-gray-500">No flags available.</Text>}
          renderItem={({ item }) => (
            <View testID={`flag-${item.key}`} className="mb-2 rounded-lg border border-gray-200 p-4">
              <Text className="font-semibold">{item.name}</Text>
              <Text className="text-xs text-gray-500">
                {item.key} · min tier: {item.min_tier}
              </Text>
              {item.description && <Text className="mt-1 text-gray-600">{item.description}</Text>}
            </View>
          )}
        />
      )}
    </View>
  );
}