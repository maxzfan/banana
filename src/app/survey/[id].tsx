import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CertifiedSticker } from '@/components/certified-sticker';
import { PeelReveal } from '@/components/peel-reveal';
import { Button, ErrorText, Field, Loading, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useMe } from '@/lib/auth';
import { FUN_QUESTIONS, STATUSES } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { BananaStatus } from '@/lib/types';

type Survey = {
  invite_id: string;
  owner_id: string;
  owner_name: string;
  owner_photo_url: string | null;
  status: BananaStatus;
  answered: boolean;
  active: boolean;
};

const ANSWERS = [
  { value: 'yes', label: 'Yes', variant: 'accent' },
  { value: 'no', label: 'No', variant: 'outline' },
  { value: 'not_sure', label: 'Not sure', variant: 'outline' },
] as const;

export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status: myStatus } = useMe();
  const [answer, setAnswer] = useState<string | null>(null);
  const [funAnswer, setFunAnswer] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, loading } = useAsync(async () => (await unwrap<Survey[]>(supabase.rpc('get_survey', { invite: id })))[0] ?? null, [id]);
  const funQuestion = useMemo(
    () => FUN_QUESTIONS[[...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % FUN_QUESTIONS.length].replace('{name}', data?.owner_name ?? 'them'),
    [data?.owner_name, id],
  );

  if (loading) return <Screen><Loading /></Screen>;
  if (!data || !data.active) {
    return (
      <Screen>
        <Text variant="title">This survey is closed</Text>
        <Text color="textSecondary">The status may have changed or the invite was withdrawn.</Text>
        <Button title="Go home" onPress={() => router.replace('/' as Href)} />
      </Screen>
    );
  }

  async function submit() {
    if (!answer) return;
    setSaving(true);
    const { error } = await supabase.rpc('submit_survey', {
      invite: id,
      answer,
      fun_question: funAnswer.trim() ? funQuestion : null,
      fun_answer: funAnswer.trim() || null,
    });
    setSaving(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  if (done || data.answered) {
    return (
      <Screen edges={['top', 'bottom']} style={{ justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: Spacing.three }}>
          <PeelReveal revealKey="done" size={170}>
            <CertifiedSticker size={90} />
          </PeelReveal>
          <Text variant="title" style={{ textAlign: 'center' }}>Thanks for vouching!</Text>
          <Text color="textSecondary" style={{ textAlign: 'center' }}>
            Your answer is private. {data.owner_name} only sees the overall result.
          </Text>
        </View>
        <Text variant="subtitle" style={{ textAlign: 'center', marginTop: Spacing.four }}>Your turn?</Text>
        <Button title={myStatus?.status === 'peel_sealed' ? 'Set your own status' : 'Update your status'} onPress={() => router.replace('/set-status?first=1' as Href)} />
        <Button title="Pick your own Bunch" variant="accent" onPress={() => router.replace('/bunch' as Href)} />
        <Button title="Maybe later" variant="ghost" onPress={() => router.replace('/' as Href)} />
      </Screen>
    );
  }

  const meta = STATUSES[data.status];
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four }}>
        <Avatar uri={data.owner_photo_url} name={data.owner_name} size={96} />
        <Text variant="caption" color="textSecondary">{data.owner_name.toUpperCase()} SAYS THEY&apos;RE {meta.label.toUpperCase()}</Text>
        <Text variant="title" style={{ textAlign: 'center' }}>
          Is {data.owner_name} {meta.question}?
        </Text>
      </View>
      <View style={{ gap: Spacing.two }}>
        {ANSWERS.map((a) => (
          <Button key={a.value} title={a.label} variant={answer === a.value ? 'primary' : a.variant === 'accent' ? 'outline' : a.variant} onPress={() => setAnswer(a.value)} />
        ))}
      </View>
      <Field label={`Bonus (optional): ${funQuestion}`} value={funAnswer} onChangeText={setFunAnswer} maxLength={200} placeholder="Keep it kind" />
      <ErrorText>{error}</ErrorText>
      <View style={{ flex: 1 }} />
      <Button title="Submit" onPress={submit} disabled={!answer} loading={saving} />
      <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>Only you can answer this. Your answer stays private.</Text>
    </Screen>
  );
}
