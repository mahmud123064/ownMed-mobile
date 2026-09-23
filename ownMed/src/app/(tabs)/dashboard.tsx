import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-foreground">
          Welcome to Dashboard
        </Text>
      </View>
    </SafeAreaView>
  );
}
