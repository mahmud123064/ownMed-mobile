import { useState } from 'react';
import {
  ChevronRight,
  Languages,
  SunMoon,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand, useAppTheme } from '@/theme';

type SettingItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
};

export default function SettingsScreen() {
  const { isDark, colors, toggleColorScheme } = useAppTheme();
  const [language, setLanguage] = useState<'English' | 'Bangla'>('English');

  const items: SettingItem[] = [
    { id: 'profile', icon: User, label: 'Profile' },
    {
      id: 'theme',
      icon: SunMoon,
      label: 'Theme',
      value: isDark ? 'Dark' : 'Light',
      onPress: toggleColorScheme,
    },
    {
      id: 'language',
      icon: Languages,
      label: 'Language',
      value: language,
      onPress: () =>
        setLanguage((prev) => (prev === 'English' ? 'Bangla' : 'English')),
    },
    // {
    //   id: 'signin',
    //   icon: LogIn,
    //   label: 'Sign In',
    //   onPress: () => router.navigate('/sign-in'),
    // },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View className="px-6 pt-4">
          <View className="flex-row items-center gap-2">
            <SunMoon color={brand[500]} size={20} strokeWidth={2.2} />
            <Text className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Preferences
            </Text>
          </View>
          <Text className="mt-2 text-3xl font-bold text-foreground">
            Settings
          </Text>
          <Text className="mt-1 text-base text-muted">
            Manage your account and app preferences.
          </Text>
        </View>

        {/* Settings list */}
        <View className="px-6 pt-5">
          <View className="overflow-hidden rounded-3xl border border-border bg-surface">
            {items.map((item, index) => {
              const Icon = item.icon;
              const row = (
                <>
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                    <Icon color={brand[600]} size={20} strokeWidth={2} />
                  </View>
                  <Text className="flex-1 text-base font-semibold text-foreground">
                    {item.label}
                  </Text>
                  {item.value ? (
                    <Text className="text-sm text-muted">{item.value}</Text>
                  ) : null}
                  <ChevronRight color={colors.muted} size={20} strokeWidth={2} />
                </>
              );

              const isLast = index === items.length - 1;

              return item.onPress ? (
                <Pressable
                  key={item.id}
                  onPress={item.onPress}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                  className={[
                    'flex-row items-center gap-4 px-4 py-4',
                    !isLast && 'border-b border-border',
                  ].join(' ')}
                >
                  {row}
                </Pressable>
              ) : (
                <View
                  key={item.id}
                  className={[
                    'flex-row items-center gap-4 px-4 py-4',
                    !isLast && 'border-b border-border',
                  ].join(' ')}
                >
                  {row}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
