import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Set EXPO_PUBLIC_INVITE_BASE_URL to the production domain (e.g. https://getbanana.app) once it exists.
function baseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return Linking.createURL('').replace(/\/$/, '');
}

export function inviteUrl(token: string) {
  return `${baseUrl()}/i/${encodeURIComponent(token)}`;
}
