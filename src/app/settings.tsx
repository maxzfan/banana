import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Card, Chip, SectionTitle, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/auth';
import { confirm, notify } from '@/lib/dialog';
import { VISIBILITY_OPTIONS } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { StatusVisibility, UserLite } from '@/lib/types';

export default function Settings() {
  const { profile, status, userId, refresh, signOut } = useMe();
  const theme = useTheme();
  const [deleting, setDeleting] = useState(false);
  const { data: blocked, reload } = useAsync(async () => {
    const rows = await unwrap<{ blocked_id: string }[]>(supabase.from('blocks').select('blocked_id'));
    if (!rows.length) return [];
    // Blocked users' profiles are hidden by policy, so show what we can.
    const people = await unwrap<UserLite[]>(
      supabase.from('profiles').select('id, username, name, photo_url').in('id', rows.map((r) => r.blocked_id)),
    );
    return rows.map((r) => people.find((p) => p.id === r.blocked_id) ?? { id: r.blocked_id, name: 'Blocked user', username: '', photo_url: null });
  });

  async function setVisibility(visibility: StatusVisibility) {
    await supabase.from('statuses').update({ visibility }).eq('user_id', userId);
    refresh();
  }
  async function setSetups(on: boolean) {
    await supabase.from('profiles').update({ setups_enabled: on }).eq('id', userId);
    refresh();
  }
  async function unblock(id: string) {
    await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', id);
    reload();
  }
  async function deleteAccount() {
    const ok = await confirm('Delete your account?', 'This permanently deletes your profile, status, friends, Bunch and messages. This cannot be undone.', 'Delete forever', true);
    if (!ok) return;
    setDeleting(true);
    const { data: files } = await supabase.storage.from('avatars').list(userId);
    if (files?.length) await supabase.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
    const { error } = await supabase.rpc('delete_account');
    setDeleting(false);
    if (error) return notify("Couldn't delete account", error.message);
    await signOut();
  }

  return (
    <Screen>
      <Button title="← Back" variant="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => router.back()} />
      <Text variant="title">Settings & privacy</Text>

      <SectionTitle>Who can see my status</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {VISIBILITY_OPTIONS.map((o) => (
          <Chip key={o.value} label={o.label} selected={status?.visibility === o.value} onPress={() => setVisibility(o.value)} />
        ))}
      </View>

      <SectionTitle>Banana Split</SectionTitle>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <View style={{ flex: 1 }}>
          <Text variant="label">Allow set-ups</Text>
          <Text variant="small" color="textSecondary">Friends can suggest matches for you (Certified Ripe only).</Text>
        </View>
        <Switch value={profile?.setups_enabled ?? true} onValueChange={setSetups} trackColor={{ true: theme.accent }} />
      </Card>

      <SectionTitle>Blocked</SectionTitle>
      {blocked && blocked.length === 0 ? <Text color="textSecondary">You haven&apos;t blocked anyone.</Text> : null}
      {blocked?.map((b) => (
        <Card key={b.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="label" style={{ flex: 1 }}>{b.name}</Text>
          <Button title="Unblock" small variant="outline" onPress={() => unblock(b.id)} />
        </Card>
      ))}

      <SectionTitle>Account</SectionTitle>
      <Button title="Sign out" variant="outline" onPress={signOut} />
      <Button title="Delete account & data" variant="danger" loading={deleting} onPress={deleteAccount} />
    </Screen>
  );
}
