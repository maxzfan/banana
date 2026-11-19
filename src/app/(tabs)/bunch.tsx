import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { CertifiedSticker } from '@/components/certified-sticker';
import { StatusChip } from '@/components/status-chip';
import { Button, Card, Chip, Empty, ErrorText, Field, SectionTitle, Screen, Text } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { useMe } from '@/lib/auth';
import { inviteUrl } from '@/lib/config';
import { confirm, notify } from '@/lib/dialog';
import { STATUSES } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { FriendRow, Invite, VerificationSummary } from '@/lib/types';

export async function shareInvite(invite: Pick<Invite, 'label' | 'token'>, statusLabel: string) {
  const url = inviteUrl(invite.token);
  const message = `Hey ${invite.label}! I'm getting my Banana status (${statusLabel}) certified and picked you for my Bunch. Takes 10 seconds: ${url}`;
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // fall through to copy
      }
    }
    await Clipboard.setStringAsync(message);
    notify('Invite copied', 'Paste it into a text or WhatsApp.');
    return;
  }
  await Share.share({ message });
}

export default function Bunch() {
  const { status, refresh } = useMe();
  const [names, setNames] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useAsync(async () => {
    const summary = (await unwrap<VerificationSummary[]>(supabase.rpc('my_verification_summary')))[0] ?? null;
    const invites = summary
      ? await unwrap<Invite[]>(
          supabase
            .from('validator_invites')
            .select('id, verification_id, label, token, validator_id, revoked_at, created_at')
            .eq('verification_id', summary.verification_id)
            .is('revoked_at', null)
            .order('created_at'),
        )
      : [];
    const friends = await unwrap<FriendRow[]>(supabase.rpc('friends_with_status'));
    return { summary, invites, friends };
  });
  useRealtime(['notifications'], () => {
    reload();
    refresh();
  });

  if (!status) return null;
  const meta = STATUSES[status.status];

  if (status.status === 'peel_sealed') {
    return (
      <Screen>
        <Text variant="title">The Bunch</Text>
        <Empty
          title="Peel Sealed can't be certified"
          body="Share a status (Ripe, Picked or Bruised) and your Bunch can vouch for it."
          action={<Button title="Set status" small onPress={() => router.push('/set-status' as Href)} />}
        />
      </Screen>
    );
  }

  const summary = data?.summary;
  const invites = data?.invites ?? [];
  const inBunch = new Set(invites.map((i) => i.validator_id).filter(Boolean));
  const eligibleFriends = (data?.friends ?? []).filter((f) => !inBunch.has(f.id));
  const certified = summary?.state === 'certified';
  const confirmations = summary?.confirmations ?? 0;
  const newLabels = names.split(',').map((n) => n.trim()).filter(Boolean);
  const total = invites.length + newLabels.length + selectedFriends.length;

  async function addValidators() {
    if (total < 3) return setError('Pick at least 3 close friends for your Bunch');
    setBusy(true);
    setError(null);
    try {
      if (selectedFriends.length) {
        await unwrap(supabase.rpc('add_friend_validators', { friend_ids: selectedFriends }));
      }
      const created = newLabels.length
        ? await unwrap<Invite[]>(supabase.rpc('create_validator_invites', { labels: newLabels }))
        : [];
      setNames('');
      setSelectedFriends([]);
      await reload();
      for (const inv of created) await shareInvite(inv, meta.label);
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inv: Invite) {
    if (!(await confirm('Remove from Bunch?', `${inv.label}'s link will stop working.`, 'Remove', true))) return;
    const ok = await unwrap<boolean>(supabase.rpc('revoke_validator_invite', { invite: inv.id }));
    if (!ok) notify("Can't remove", 'They already answered.');
    reload();
  }

  return (
    <Screen>
      <Text variant="title">The Bunch</Text>
      <Card style={{ alignItems: 'center', gap: Spacing.two, backgroundColor: certified ? Palette.leaf : undefined }}>
        {certified ? <CertifiedSticker size={110} /> : null}
        <StatusChip status={status.status} large />
        <Text variant="subtitle" style={{ textAlign: 'center', color: certified ? '#fff' : undefined }}>
          {certified ? 'Certified by your Bunch!' : `${Math.min(confirmations, 3)} of 3 confirmations`}
        </Text>
        {!certified ? (
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 56,
                  height: 14,
                  borderRadius: Radius.pill,
                  backgroundColor: i < confirmations ? Palette.leaf : Palette.banana,
                  opacity: i < confirmations ? 1 : 0.35,
                }}
              />
            ))}
          </View>
        ) : null}
        <Text variant="small" color={certified ? '#fff' : 'textSecondary'} style={{ textAlign: 'center' }}>
          Individual answers stay private. You only see the overall result.
        </Text>
      </Card>

      {invites.length > 0 ? <SectionTitle>Your validators</SectionTitle> : null}
      {invites.map((inv) => (
        <Card key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Text variant="label">{inv.label}</Text>
            <Text variant="small" color="textSecondary">
              {inv.validator_id ? 'On Banana · in your Bunch' : 'Link not opened yet'}
            </Text>
          </View>
          <Button title="Share link" small variant="outline" onPress={() => shareInvite(inv, meta.label)} />
          <Button title="Remove" small variant="ghost" onPress={() => revoke(inv)} />
        </Card>
      ))}

      {!certified ? (
        <>
          <SectionTitle>{invites.length ? 'Add more validators' : 'Pick your Bunch'}</SectionTitle>
          <Text color="textSecondary">
            Choose at least 3 close friends. Each gets a unique link — only they can answer.
          </Text>
          {eligibleFriends.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              {eligibleFriends.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  selected={selectedFriends.includes(f.id)}
                  onPress={() =>
                    setSelectedFriends((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id]))
                  }
                />
              ))}
            </View>
          ) : null}
          <Field
            label="Not on Banana yet? Add names (comma separated)"
            value={names}
            onChangeText={setNames}
            placeholder="Ann, Bob, Cyd"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title={newLabels.length ? 'Create & share invite links' : 'Add to my Bunch'}
            onPress={addValidators}
            loading={busy}
            disabled={newLabels.length + selectedFriends.length === 0}
          />
          <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
            {total} validator{total === 1 ? '' : 's'} selected · minimum 3
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
