import { HeartPulse } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-brand-600">
          <HeartPulse color="#ffffff" size={32} strokeWidth={2} />
        </View>
        <Text className="text-2xl font-bold text-foreground">OwnMed</Text>
        <Text className="text-center text-base text-muted">
          Project scaffold is ready. Feature screens get added step by step.
        </Text>
        <View className="mt-2 rounded-full border border-border bg-surface px-4 py-2">
          <Text className="text-xs font-medium text-muted">
            NativeWind · Expo Router · Lucide
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
