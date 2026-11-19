import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CertifiedSticker } from '@/components/certified-sticker';
import { StatusChip } from '@/components/status-chip';
import { Button, Card, Field, Loading, Screen, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/auth';
import { confirm, notify } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { Friendship, MyStatus, Profile } from '@/lib/types';

const REASONS = ['Fake profile', 'Harassment', 'Spam', 'Inappropriate photo', 'Other'];

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const theme = useTheme();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');

  const { data, loading, reload } = useAsync(async () => {
    const [profile, status, link] = await Promise.all([
      unwrap<Profile | null>(supabase.from('profiles').select('*').eq('id', id).maybeSingle()),
      unwrap<MyStatus | null>(supabase.from('statuses').select('*').eq('user_id', id).maybeSingle()),
      unwrap<Friendship | null>(
        supabase
          .from('friendships')
          .select('*')
          .or(`and(requester_id.eq.${id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${id})`)
          .maybeSingle(),
      ),
    ]);
    return { profile, status, link };
  }, [id, userId]);

  if (loading) return <Screen><Loading /></Screen>;
  const p = data?.profile;
  if (!p) {
    return (
      <Screen>
        <Text variant="title">Not available</Text>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  const link = data?.link;
  const isMe = id === userId;

  async function addFriend() {
    await supabase.from('friendships').insert({ requester_id: userId, addressee_id: id });
    reload();
  }
  async function accept() {
    await supabase.from('friendships').update({ state: 'accepted' }).eq('id', link!.id);
    reload();
  }
  async function removeFriend() {
    if (!(await confirm('Remove friend?', `${p!.name} won't see your status anymore.`, 'Remove', true))) return;
    await supabase.from('friendships').delete().eq('id', link!.id);
    reload();
  }
  async function block() {
    if (!(await confirm(`Block ${p!.name}?`, "You won't see each other anywhere on Banana. They won't be told.", 'Block', true))) return;
    const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: id });
    if (error) return notify("Couldn't block", error.message);
    router.back();
  }
  async function submitReport() {
    if (!reason) return;
    const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_id: id, reason, details: details || null });
    setReporting(false);
    notify(error ? "Couldn't send report" : 'Report sent', error?.message ?? 'Thanks — our team will review it.');
  }

  return (
    <Screen>
      <Button title="← Back" variant="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => router.back()} />
      <View style={{ alignItems: 'center', gap: Spacing.two }}>
        <View>
          <Avatar uri={p.photo_url} name={p.name} size={120} />
          {data?.status?.certified_at ? (
            <View style={{ position: 'absolute', right: -16, bottom: -6 }}>
              <CertifiedSticker size={60} />
            </View>
          ) : null}
        </View>
        <Text variant="title">{p.name}</Text>
        <Text color="textSecondary">@{p.username}</Text>
        <StatusChip status={data?.status?.status ?? null} large />
        {p.bio ? <Text style={{ textAlign: 'center' }}>{p.bio}</Text> : null}
        {p.setups_made > 0 ? (
          <Text variant="small" color="brown">{p.setups_made} successful set-up{p.setups_made === 1 ? '' : 's'}</Text>
        ) : null}
      </View>
      {!isMe ? (
        <View style={{ gap: Spacing.two }}>
          {!link ? <Button title="Add friend" onPress={addFriend} /> : null}
          {link?.state === 'pending' && link.requester_id === userId ? <Button title="Request sent" variant="outline" disabled /> : null}
          {link?.state === 'pending' && link.addressee_id === userId ? <Button title="Accept request" variant="accent" onPress={accept} /> : null}
          {link?.state === 'accepted' ? <Button title="Remove friend" variant="outline" onPress={removeFriend} /> : null}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Report" variant="ghost" small style={{ flex: 1 }} onPress={() => setReporting(true)} />
            <Button title="Block" variant="ghost" small style={{ flex: 1 }} onPress={block} />
          </View>
        </View>
      ) : null}

      <Modal visible={reporting} transparent animationType="slide" onRequestClose={() => setReporting(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setReporting(false)} />
        <Card style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two, backgroundColor: theme.background }}>
          <Text variant="subtitle">Report {p.name}</Text>
          {REASONS.map((r) => (
            <Button key={r} title={r} small variant={reason === r ? 'primary' : 'outline'} onPress={() => setReason(r)} />
          ))}
          <Field value={details} onChangeText={setDetails} placeholder="Anything else? (optional)" multiline maxLength={1000} />
          <Button title="Send report" variant="danger" disabled={!reason} onPress={submitReport} />
        </Card>
      </Modal>
    </Screen>
  );
}
