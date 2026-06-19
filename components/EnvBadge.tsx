import { Text } from 'react-native';

const ENV = (process.env.EXPO_PUBLIC_APP_ENV ?? 'unknown').toLowerCase();

const COLOR: Record<string, string> = {
  production: 'text-red-600',
  staging: 'text-amber-600',
  unknown: 'text-gray-400',
};

export function EnvBadge() {
  return (
    <Text
      testID="env-badge"
      accessibilityLabel={`Environment: ${ENV}`}
      className={`self-start text-xs font-medium ${COLOR[ENV] ?? COLOR.unknown}`}>
      {ENV}
    </Text>
  );
}
