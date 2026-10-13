import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../global.css';

import OnboardingModal from '@/components/onboarding/OnboardingModal';
import { AppDataProvider } from '@/context/AppDataContext';
import {
  addReminderTapListener,
  configureForegroundHandler,
} from '@/lib/notifications';

// At module scope rather than in an effect: this decides whether a reminder is
// shown at all while the app is open, and a notification can arrive before the
// first render finishes. Registering it here means it is never briefly absent.
// No-ops where the platform cannot provide reminders at all.
configureForegroundHandler();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    // A tap on a reminder lands on the health dashboard rather than wherever the
    // app was last left, so the notification leads somewhere related to it.
    // The listener is guarded on our own identifier prefix inside the helper, so
    // a notification from some other source is not hijacked into this screen.
    const subscription = addReminderTapListener(() =>
      router.push('/dashboard'),
    );
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppDataProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          <OnboardingModal />
          <StatusBar style="auto" />
        </AppDataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
