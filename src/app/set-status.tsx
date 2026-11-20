import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { PeelReveal } from '@/components/peel-reveal';
import { StatusChip } from '@/components/status-chip';
import { Button, Chip, ErrorText, Screen, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/auth';
import { confirm } from '@/lib/dialog';
import { STATUS_ORDER, STATUSES, VISIBILITY_OPTIONS } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { BananaStatus, StatusVisibility } from '@/lib/types';

export default function SetStatus() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const { status: current, userId, refresh } = useMe();
  const theme = useTheme();
  const [status, setStatus] = useState<BananaStatus>(current?.status ?? 'peel_sealed');
  const [visibility, setVisibility] = useState<StatusVisibility>(current?.visibility ?? 'friends');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(s: BananaStatus) {
    setStatus(s);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function save() {
    const changing = status !== current?.status;
    if (changing && current?.certified_at) {
      const ok = await confirm(
        'Lose your Certified sticker?',
        'Changing your status removes the badge. Your Bunch will be asked to re-confirm.',
        'Change status',
      );
      if (!ok) return;
    }
    setSaving(true);
    const { error } = await supabase.from('statuses').update({ status, visibility }).eq('user_id', userId);
    setSaving(false);
    if (error) return setError(error.message);
    await refresh();
    if (first) router.replace((status === 'peel_sealed' ? '/home' : '/bunch') as Href);
    else router.back();
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">{first ? "What's your status?" : 'Update your status'}</Text>
      <View style={{ alignItems: 'center' }}>
        <PeelReveal revealKey={status} size={150}>
          <StatusChip status={status} large />
        </PeelReveal>
      </View>
      <View style={{ gap: Spacing.two }}>
        {STATUS_ORDER.map((s) => {
          const meta = STATUSES[s];
          const selected = s === status;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(s)}
              style={{
                borderRadius: Radius.md,
                borderWidth: 3,
                borderColor: selected ? meta.color : theme.border,
                backgroundColor: selected ? meta.color : theme.card,
                padding: Spacing.three,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Text variant="subtitle" style={{ color: selected ? meta.fg : theme.text }}>
                {meta.label}
              </Text>
              <Text variant="small" style={{ color: selected ? meta.fg : theme.textSecondary }}>
                {meta.meaning}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="label">Who can see it</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {VISIBILITY_OPTIONS.map((o) => (
          <Chip key={o.value} label={o.label} selected={visibility === o.value} onPress={() => setVisibility(o.value)} />
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title={first ? 'Continue' : 'Save'} onPress={save} loading={saving} />
      {!first ? <Button title="Cancel" variant="ghost" onPress={() => router.back()} /> : null}
    </Screen>
  );
}
