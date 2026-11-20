import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ErrorText, Field, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useMe } from '@/lib/auth';
import { AUDIENCES, nextFourAm } from '@/lib/tonight';
import { supabase } from '@/lib/supabase';
import type { TonightAudience, TonightPost } from '@/lib/types';

// Going Bananas composer. Friends-only; no location unless typed into the note.
export default function Tonight() {
  const { userId } = useMe();
  const [note, setNote] = useState<string | null>(null);
  const [audience, setAudience] = useState<TonightAudience | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: mine } = useAsync(async () =>
    (await unwrap<TonightPost[]>(supabase.rpc('tonight_feed'))).find((p) => p.user_id === userId) ?? null,
  );
  const noteValue = note ?? mine?.note ?? '';
  const audienceValue = audience ?? mine?.audience ?? 'friends';

  async function post() {
    setSaving(true);
    const { error } = await supabase.rpc('set_tonight', {
      note: noteValue,
      audience: audienceValue,
      expires_at: nextFourAm().toISOString(),
    });
    setSaving(false);
    if (error) return setError(error.message);
    router.back();
  }
  async function clear() {
    await supabase.rpc('clear_tonight');
    router.back();
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Going Bananas</Text>
      <Text color="textSecondary">Let friends know you&apos;re free tonight. It resets automatically at 4am.</Text>
      <Field
        label="Note (optional)"
        value={noteValue}
        onChangeText={setNote}
        placeholder="drinks downtown?"
        maxLength={140}
      />
      <Text variant="small" color="textSecondary">
        We never share your location. Only what you type here.
      </Text>
      <Text variant="label">Who sees it</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {AUDIENCES.map((a) => (
          <Chip key={a.value} label={a.label} selected={audienceValue === a.value} onPress={() => setAudience(a.value)} />
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title={mine ? 'Update' : "I'm free tonight"} onPress={post} loading={saving} />
      {mine ? <Button title="I'm not going out anymore" variant="outline" onPress={clear} /> : null}
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
