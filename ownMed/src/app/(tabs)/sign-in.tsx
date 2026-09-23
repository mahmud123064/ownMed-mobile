import { Controller, useForm } from 'react-hook-form';
import { Check } from 'lucide-react-native';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { status, useAppTheme } from '@/theme';

type FormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

/** Google "G" mark (multicolor), for the OAuth button. */
function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export default function SignInScreen() {
  const { colors } = useAppTheme();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = () => {
    Alert.alert('Sign In', 'Authentication is not wired up yet.');
  };

  const handleGoogleSignIn = () => {
    Alert.alert('Google Sign-In', 'OAuth is not wired up yet.');
  };

  const handleForgotPassword = () => {
    Alert.alert('Forgot password', 'Not wired up yet.');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {/* Centered content */}
          <View className="flex-1 justify-center px-6 pb-8">
            <Text className="text-center text-3xl font-bold text-foreground">
              Sign In
            </Text>
            <Text className="mt-1 text-center text-base text-muted">
              Welcome back — enter your details to continue.
            </Text>

            <View className="mt-8 gap-4">
              {/* Email */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">Email</Text>
                <Controller
                  control={control}
                  name="email"
                  rules={{
                    required: 'Email is required.',
                    pattern: {
                      value: /\S+@\S+\.\S+/,
                      message: 'Enter a valid email address.',
                    },
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                    />
                  )}
                />
                {errors.email && (
                  <Text style={{ color: status.danger }} className="text-xs">
                    {errors.email.message}
                  </Text>
                )}
              </View>

              {/* Password */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">
                  Password
                </Text>
                <Controller
                  control={control}
                  name="password"
                  rules={{
                    required: 'Password is required.',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters.',
                    },
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Enter your password"
                      placeholderTextColor={colors.muted}
                      secureTextEntry
                      autoCapitalize="none"
                      className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                    />
                  )}
                />
                {errors.password && (
                  <Text style={{ color: status.danger }} className="text-xs">
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {/* Remember me + Forgot password */}
              <View className="flex-row items-center justify-between">
                <Controller
                  control={control}
                  name="rememberMe"
                  render={({ field: { value, onChange } }) => (
                    <Pressable
                      onPress={() => onChange(!value)}
                      hitSlop={8}
                      className="flex-row items-center gap-2"
                    >
                      <View
                        className={[
                          'h-5 w-5 items-center justify-center rounded-md border',
                          value
                            ? 'border-brand-600 bg-brand-600'
                            : 'border-border bg-surface',
                        ].join(' ')}
                      >
                        {value ? (
                          <Check color="#ffffff" size={14} strokeWidth={3} />
                        ) : null}
                      </View>
                      <Text className="text-sm text-foreground">Remember me</Text>
                    </Pressable>
                  )}
                />
                <Pressable onPress={handleForgotPassword} hitSlop={8}>
                  <Text className="text-sm font-semibold text-brand-600">
                    Forgot password?
                  </Text>
                </Pressable>
              </View>

              {/* Sign In button */}
              <Pressable
                onPress={handleSubmit(onSubmit)}
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                className="mt-2 items-center justify-center rounded-2xl bg-brand-600 py-4"
              >
                <Text className="text-base font-semibold text-white">Sign In</Text>
              </Pressable>

              {/* Divider */}
              <View className="mt-2 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-border" />
                <Text className="text-xs font-medium text-muted">or</Text>
                <View className="h-px flex-1 bg-border" />
              </View>

              {/* Google button */}
              <Pressable
                onPress={handleGoogleSignIn}
                className="flex-row items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-4"
              >
                <GoogleIcon />
                <Text className="text-base font-semibold text-foreground">
                  Sign In with Google
                </Text>
              </Pressable>
            </View>

            {/* Footer */}
            <View className="mt-8 flex-row items-center justify-center gap-1">
              <Text className="text-sm text-muted">Are you new?</Text>
              <Text className="text-sm font-semibold text-brand-600">Sign up</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
