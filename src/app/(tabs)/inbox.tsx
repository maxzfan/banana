import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, Card, Empty, Screen, SectionTitle, Text } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { notify } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { ChatSummary, Notification, SetupPrompt, UserLite } from '@/lib/types';

type Payload = Notification['payload'] & { chat_id?: string; setup_id?: string };

function describe(n: Notification, actor?: UserLite) {
  const who = actor?.name ?? 'Someone';
  const p = n.payload as Payload;
  switch (n.kind) {
    case 'friend_request':
      return { text: `${who} sent you a friend request`, href: '/friends' };
    case 'friend_accepted':
      return { text: `${who} accepted your friend request`, href: `/user/${n.actor_id}` };
    case 'validator_request':
      return { text: `${who} picked you for their Bunch. Vouch for them?`, href: `/survey/${p.invite_id}` };
    case 'reconfirm_request':
      return { text: `${who} changed their status. Can you re-confirm?`, href: `/survey/${p.invite_id}` };
    case 'validator_joined':
      return { text: `${who} joined your Bunch`, href: '/bunch' };
    case 'certified':
      return { text: "You're Certified! Your Bunch vouched for you.", href: '/bunch' };
    case 'setup_suggested':
      return { text: `${who} thinks you'd hit it off with someone`, href: undefined };
    case 'setup_matched':
      return { text: `It's a match with ${who}!`, href: `/chat/${p.chat_id}` };
    case 'setup_success':
      return { text: 'Your Banana Split worked! They both said yes.', href: '/me' };
    case 'tonight_join':
      return { text: `${who} is in for tonight`, href: `/chat/${p.chat_id}` };
    default:
      return { text: n.kind, href: undefined };
  }
}

function SetupCard({ s, onDone }: { s: SetupPrompt; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function respond(decision: 'accept' | 'pass') {
    setBusy(decision);
    const { data: matched, error } = await supabase.rpc('respond_setup', { setup: s.setup_id, decision });
    setBusy(null);
    if (error) return notify("Couldn't respond", error.message);
    if (matched) notify("It's a match!", `You and ${s.other_name} both said yes. Chat is open.`);
    onDone();
  }
  return (
    <Card style={{ gap: Spacing.two, borderColor: Palette.banana, borderWidth: 2 }}>
      <Text variant="caption" color="textSecondary">
        BANANA SPLIT · FROM {(s.matchmaker_name ?? 'A FRIEND').toUpperCase()}
      </Text>
      <Pressable onPress={() => router.push(`/user/${s.other_id}` as Href)} style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
        <Avatar uri={s.other_photo_url} name={s.other_name} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">{s.other_name}</Text>
          <Text variant="small" color="textSecondary">@{s.other_username} · Certified Ripe</Text>
        </View>
      </Pressable>
      {s.note ? (
        <View style={{ backgroundColor: Palette.cream, borderRadius: Radius.md, padding: Spacing.two }}>
          <Text style={{ color: Palette.ink }}>&ldquo;{s.note}&rdquo;</Text>
        </View>
      ) : null}
      {s.matched ? (
        <Button title={`Chat with ${s.other_name}`} variant="accent" onPress={() => router.push(`/chat/${s.chat_id}` as Href)} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Pass" variant="outline" style={{ flex: 1 }} loading={busy === 'pass'} onPress={() => respond('pass')} />
            <Button title="I'm in" variant="accent" style={{ flex: 1 }} loading={busy === 'accept'} onPress={() => respond('accept')} />
          </View>
          <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
            {s.other_name} only finds out if you both say yes.
          </Text>
        </>
      )}
    </Card>
  );
}

export default function Inbox() {
  const { data, reload } = useAsync(async () => {
    const [notes, prompts, chats] = await Promise.all([
      unwrap<Notification[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
      unwrap<SetupPrompt[]>(supabase.rpc('my_setup_prompts')),
      unwrap<ChatSummary[]>(supabase.rpc('my_chats')),
    ]);
    const ids = [...new Set(notes.map((n) => n.actor_id).filter(Boolean))] as string[];
    const actors = ids.length
      ? await unwrap<UserLite[]>(supabase.from('profiles').select('id, username, name, photo_url').in('id', ids))
      : [];
    return { notes, prompts: prompts.filter((p) => !p.matched), chats, actors: new Map(actors.map((a) => [a.id, a])) };
  });
  useRealtime(['notifications', 'messages', 'chat_members'], reload);

  const unread = data?.notes.filter((n) => !n.read_at).map((n) => n.id) ?? [];
  useEffect(() => {
    if (unread.length) supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread).then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.join(',')]);

  const empty = data && !data.notes.length && !data.prompts.length && !data.chats.length;

  return (
    <Screen>
      <Text variant="title">Inbox</Text>
      {empty ? <Empty title="All quiet" body="Set-ups, chats, friend requests and Bunch updates show up here." /> : null}

      {data?.prompts.length ? <SectionTitle>Set-ups for you</SectionTitle> : null}
      {data?.prompts.map((s) => <SetupCard key={s.setup_id} s={s} onDone={reload} />)}

      {data?.chats.length ? <SectionTitle>Chats</SectionTitle> : null}
      {data?.chats.map((c) => {
        const first = c.members[0];
        const title = c.kind === 'setup' ? c.members.map((m) => m.name).join(', ') || 'Chat' : (c.title ?? 'Tonight');
        return (
          <Pressable key={c.chat_id} onPress={() => router.push(`/chat/${c.chat_id}` as Href)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <Avatar uri={first?.photo_url} name={first?.name ?? 'B'} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{title}</Text>
                <Text variant="small" color="textSecondary" numberOfLines={1}>
                  {c.last_body ?? (c.kind === 'setup' ? "It's a match! Say hi" : 'Going bananas tonight')}
                </Text>
              </View>
              {c.unread ? (
                <View style={{ backgroundColor: Palette.leaf, borderRadius: Radius.pill, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text variant="caption" style={{ color: '#fff' }}>{c.unread}</Text>
                </View>
              ) : null}
            </Card>
          </Pressable>
        );
      })}

      {data?.notes.length ? <SectionTitle>Activity</SectionTitle> : null}
      {data?.notes.map((n) => {
        const actor = n.actor_id ? data.actors.get(n.actor_id) : undefined;
        const { text, href } = describe(n, actor);
        return (
          <Pressable key={n.id} disabled={!href} onPress={() => href && router.push(href as Href)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, opacity: n.read_at ? 0.75 : 1 }}>
              <Avatar uri={actor?.photo_url} name={actor?.name ?? 'B'} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant={n.read_at ? 'body' : 'label'}>{text}</Text>
                <Text variant="caption" color="textSecondary">
                  {new Date(n.created_at).toLocaleString()}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
