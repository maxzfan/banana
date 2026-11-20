import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { PeelReveal } from '@/components/peel-reveal';
import { Button, ErrorText, Loading, Screen, Text } from '@/components/ui';
import { Fonts, Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { pendingInvite } from '@/lib/pending';
import { STATUSES } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { BananaStatus } from '@/lib/types';

type Preview = { owner_name: string | null; owner_photo_url: string | null; status: BananaStatus; valid: boolean };

// Landing page for validator invite links: https://<domain>/i/<token>
export default function InviteLanding() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, profile } = useAuth();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('get_invite_preview', { invite_token: token }).then(({ data }) => setPreview((data as Preview[])?.[0] ?? null));
  }, [token]);

  const onboarded = !!profile?.username && !!profile?.name;

  async function respond() {
    if (!session) {
      pendingInvite.set(token);
      router.replace('/welcome' as Href);
      return;
    }
    if (!onboarded) {
      pendingInvite.set(token);
      router.replace('/onboarding' as Href);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('claim_invite', { invite_token: token });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(`/survey/${data}` as Href);
  }

  if (preview === undefined) return <Screen><Loading /></Screen>;
  if (!preview || !preview.valid) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Text variant="title" style={{ textAlign: 'center' }}>This invite has expired</Text>
        <Text color="textSecondary" style={{ textAlign: 'center' }}>Ask your friend to send you a new link.</Text>
        <Button title="Open Banana" onPress={() => router.replace('/' as Href)} />
      </Screen>
    );
  }
  const name = preview.owner_name ?? 'Your friend';
  return (
    <Screen edges={['top', 'bottom']} style={{ justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: Spacing.three, marginTop: Spacing.five }}>
        <Text style={{ fontFamily: Fonts.bold, fontSize: 40, color: Palette.peel }}>Banana</Text>
        <PeelReveal revealKey={token} size={170}>
          <Avatar uri={preview.owner_photo_url} name={name} size={100} />
        </PeelReveal>
        <Text variant="title" style={{ textAlign: 'center' }}>{name} picked you for their Bunch</Text>
        <Text color="textSecondary" style={{ textAlign: 'center' }}>
          They say they&apos;re {STATUSES[preview.status].label} ({STATUSES[preview.status].meaning.toLowerCase()}). One quick question
          to vouch for them. Your answer stays private.
        </Text>
      </View>
      <View style={{ gap: Spacing.two }}>
        <ErrorText>{error}</ErrorText>
        <Button title={session ? 'Answer the survey' : 'Sign up to answer'} onPress={respond} loading={busy} />
        {!session ? <Text variant="small" color="textSecondary" style={{ textAlign: 'center' }}>Takes 30 seconds with your phone number.</Text> : null}
      </View>
    </Screen>
  );
}
