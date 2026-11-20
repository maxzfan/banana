import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { takeStatusPickerFlag } from '@/lib/pending';

export default function Index() {
  const { session, profile } = useAuth();
  if (!session) return <Redirect href={'/welcome' as Href} />;
  if (!profile?.username || !profile?.name) return <Redirect href={'/onboarding' as Href} />;
  if (takeStatusPickerFlag()) {
    return <Redirect href={'/set-status?first=1' as Href} />;
  }
  return <Redirect href={'/home' as Href} />;
}
