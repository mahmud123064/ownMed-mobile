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
          tabBarIcon: ({ color, size }) => (
            <House color={color} size={size} strokeWidth={2} />
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
          title: 'Sign In',
          tabBarIcon: ({ color, size }) => (
            <LogIn color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
