import { Tabs } from 'expo-router';
import {
  HeartPulse,
  House,
  LayoutDashboard,
  LogIn,
  Settings,
} from 'lucide-react-native';

import { brand, useAppTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      initialRouteName="index"
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
        name="health-tips"
        options={{
          title: 'Health Tips',
          tabBarIcon: ({ color, size }) => (
            <HeartPulse color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          // Home is the tab the app opens on, so it is drawn a size up from its
          // neighbours — a larger icon plus a heavier label is what makes it
          // read as the current one at a glance. `size` is the navigator's
          // default, so the offset keeps working if that default ever changes.
          tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
          tabBarIcon: ({ color, size }) => (
            <House color={color} size={size + 5} strokeWidth={2.25} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="sign-in"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <LogIn color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen name="sign-up" options={{ href: null }} />
      <Tabs.Screen name="forgot-password" options={{ href: null }} />
    </Tabs>
  );
}
