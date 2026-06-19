// Visual component to see which environment we are currently viewing. 
import { View, Text } from 'react-native';

const ENV = (process.env.EXPO_PUBLIC_APP_ENV ?? 'unknown').toLowerCase();

// production = red (danger), staging = amber, anything else = gray.
const STYLES: Record<string, { box: string; dot: string; text: string }> = {
  production: { box: 'bg-red-100 border-red-300', dot: 'bg-red-500', text: 'text-red-700' },
  staging: { box: 'bg-amber-100 border-amber-300', dot: 'bg-amber-500', text: 'text-amber-700' },
  unknown: { box: 'bg-gray-100 border-gray-300', dot: 'bg-gray-400', text: 'text-gray-600' },
};

export function EnvBadge() {
  const s = STYLES[ENV] ?? STYLES.unknown;
  return (
    <View
      testID="env-badge"
      accessibilityLabel={`Environment: ${ENV}`}
      className={`flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 ${s.box}`}>
      <View className={`h-2 w-2 rounded-full ${s.dot}`} />
      <Text className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>{ENV}</Text>
    </View>
  );
}
