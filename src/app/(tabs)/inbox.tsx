import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card, Empty, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { supabase } from '@/lib/supabase';
import type { Notification, UserLite } from '@/lib/types';

function describe(n: Notification, actor?: UserLite) {
  const who = actor?.name ?? 'Someone';
  switch (n.kind) {
    case 'friend_request':
      return { text: `${who} sent you a friend request`, href: '/friends' };
    case 'friend_accepted':
      return { text: `${who} accepted your friend request`, href: `/user/${n.actor_id}` };
    case 'validator_request':
      return { text: `${who} picked you for their Bunch. Vouch for them?`, href: `/survey/${n.payload.invite_id}` };
    case 'reconfirm_request':
      return { text: `${who} changed their status. Can you re-confirm?`, href: `/survey/${n.payload.invite_id}` };
    case 'validator_joined':
      return { text: `${who} joined your Bunch`, href: '/bunch' };
    case 'certified':
      return { text: "You're Certified! Your Bunch vouched for you.", href: '/bunch' };
    default:
      return { text: n.kind, href: undefined };
  }
}

export default function Inbox() {
  const { data, reload } = useAsync(async () => {
    const notes = await unwrap<Notification[]>(
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
    );
    const ids = [...new Set(notes.map((n) => n.actor_id).filter(Boolean))] as string[];
    const actors = ids.length
      ? await unwrap<UserLite[]>(supabase.from('profiles').select('id, username, name, photo_url').in('id', ids))
      : [];
    return { notes, actors: new Map(actors.map((a) => [a.id, a])) };
  });
  useRealtime(['notifications'], reload);

  const unread = data?.notes.filter((n) => !n.read_at).map((n) => n.id) ?? [];
  useEffect(() => {
    if (unread.length) supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread).then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.join(',')]);

  return (
    <Screen>
      <Text variant="title">Inbox</Text>
      {data && data.notes.length === 0 ? <Empty title="All quiet" body="Friend requests and Bunch updates show up here." /> : null}
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
