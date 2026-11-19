import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  useFonts,
} from '@expo-google-fonts/fredoka';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { onboardingFlags, pendingInvite } from '@/lib/pending';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold });
  return <AuthProvider>{fontsLoaded ? <RootStack /> : null}</AuthProvider>;
}

function RootStack() {
  const { session, profile, loading } = useAuth();
  const theme = useTheme();
  const signedIn = !!session;
  const onboarded = !!profile?.username && !!profile?.name;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // After sign-up/sign-in: invited validators go straight to the survey; new users pick a status.
  useEffect(() => {
    if (!signedIn || !onboarded) return;
    const token = pendingInvite.get();
    if (token) {
      pendingInvite.clear();
      onboardingFlags.showStatusPicker = false;
      supabase.rpc('claim_invite', { invite_token: token }).then(({ data, error }) => {
        if (error) notify('Invite problem', error.message);
        else setTimeout(() => router.replace(`/survey/${data}` as Href), 0);
      });
    }
  }, [signedIn, onboarded]);

  if (loading) return null;

  const navTheme = theme.dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{ ...navTheme, colors: { ...navTheme.colors, background: theme.background, card: theme.background, text: theme.text, primary: theme.brown, border: theme.border } }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="user/[id]" />
          <Stack.Screen name="set-status" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="survey/[id]" />
        </Stack.Protected>
        <Stack.Screen name="index" />
        <Stack.Screen name="i/[token]" />
      </Stack>
    </ThemeProvider>
  );
}
