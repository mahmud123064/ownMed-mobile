import { Tabs } from 'expo-router';
import { House } from 'lucide-react-native';

import { brand, useAppTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand[600],
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <House color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
