import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CertifiedSticker } from '@/components/certified-sticker';
import { Button, Chip, Empty, ErrorText, Field, Loading, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { notify } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { UserLite } from '@/lib/types';

// Banana Split: suggest a match between two Certified Ripe friends.
export default function NewSetup() {
  const params = useLocalSearchParams<{ a?: string }>();
  const [a, setA] = useState<string | null>(params.a ?? null);
  const [b, setB] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useAsync(() => unwrap<UserLite[]>(supabase.rpc('setup_candidates')));

  if (loading) return <Screen><Loading /></Screen>;
  const people = data ?? [];
  const pa = people.find((p) => p.id === a);
  const pb = people.find((p) => p.id === b);

  async function send() {
    if (!a || !b) return;
    setSaving(true);
    const { error } = await supabase.rpc('suggest_setup', { a, b, note: note.trim() || null });
    setSaving(false);
    if (error) return setError(error.message);
    notify('Set-up sent!', "We'll let you know if it's a match. Passes stay private.");
    router.back();
  }

  function pick(id: string) {
    if (a === id) return setA(null);
    if (b === id) return setB(null);
    if (!a) setA(id);
    else setB(id);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Button title="← Back" variant="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => router.back()} />
      <Text variant="title">Banana Split</Text>
      <Text color="textSecondary">
        Set up two Certified Ripe friends. They each decide privately — a pass is never revealed.
      </Text>
      {people.length < 2 ? (
        <Empty title="Not enough Certified Ripe friends" body="You need at least two friends who are Certified Ripe with set-ups on." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, marginVertical: Spacing.two }}>
            {[pa, pb].map((p, i) => (
              <View key={i} style={{ alignItems: 'center', gap: Spacing.one, width: 110 }}>
                <Avatar uri={p?.photo_url} name={p?.name ?? '?'} size={80} />
                <Text variant="label" numberOfLines={1}>{p?.name ?? 'Pick a friend'}</Text>
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'center' }}>
            <CertifiedSticker size={44} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {people.map((p) => (
              <Chip key={p.id} label={p.name} selected={p.id === a || p.id === b} onPress={() => pick(p.id)} />
            ))}
          </View>
          <Field label="Why they'd click (optional)" value={note} onChangeText={setNote} placeholder="Both obsessed with bad puns" maxLength={280} multiline />
          <ErrorText>{error}</ErrorText>
          <Button title="Send set-up" onPress={send} disabled={!a || !b} loading={saving} />
        </>
      )}
    </Screen>
  );
}
