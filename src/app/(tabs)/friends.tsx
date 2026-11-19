import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { UserRow } from '@/components/user-row';
import { Button, Card, Empty, Field, SectionTitle, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { useMe } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import type { FriendRow, Friendship, UserLite } from '@/lib/types';

type ContactMatch = UserLite & { contactName?: string };

export default function Friends() {
  const { userId } = useMe();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserLite[] | null>(null);
  const [contactMatches, setContactMatches] = useState<ContactMatch[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data, reload } = useAsync(async () => {
    const [friends, links] = await Promise.all([
      unwrap<FriendRow[]>(supabase.rpc('friends_with_status')),
      unwrap<Friendship[]>(supabase.from('friendships').select('*').eq('state', 'pending')),
    ]);
    const pendingIds = links.map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id));
    const people = pendingIds.length
      ? await unwrap<UserLite[]>(supabase.from('profiles').select('id, username, name, photo_url').in('id', pendingIds))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      friends,
      links,
      incoming: links.filter((l) => l.addressee_id === userId).map((l) => ({ link: l, user: byId.get(l.requester_id) })),
      outgoing: links.filter((l) => l.requester_id === userId).map((l) => ({ link: l, user: byId.get(l.addressee_id) })),
    };
  }, [userId]);
  useRealtime(['friendships'], reload);

  function relation(id: string): 'friend' | 'incoming' | 'outgoing' | 'none' {
    if (data?.friends.some((f) => f.id === id)) return 'friend';
    const l = data?.links.find((x) => x.requester_id === id || x.addressee_id === id);
    if (!l) return 'none';
    return l.requester_id === userId ? 'outgoing' : 'incoming';
  }

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) return setResults(null);
    const { data } = await supabase.rpc('search_users', { q });
    setResults((data as UserLite[]) ?? []);
  }

  async function add(id: string) {
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: id });
    if (error) notify("Couldn't send request", error.message);
    reload();
  }
  async function accept(link: Friendship) {
    await supabase.from('friendships').update({ state: 'accepted' }).eq('id', link.id);
    reload();
  }
  async function remove(link: Friendship) {
    await supabase.from('friendships').delete().eq('id', link.id);
    reload();
  }

  async function syncContacts() {
    setSyncing(true);
    try {
      const { granted } = await requestPermissionsAsync();
      if (!granted) return notify('Contacts permission needed', 'Allow access in Settings to find friends.');
      const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
      const nameByPhone = new Map<string, string>();
      for (const c of contacts) {
        for (const p of c.phones ?? []) {
          const n = p.number ? normalizePhone(p.number) : null;
          if (n) nameByPhone.set(n, c.fullName ?? '');
        }
      }
      const phones = [...nameByPhone.keys()];
      const matches: ContactMatch[] = [];
      for (let i = 0; i < phones.length; i += 500) {
        const rows = await unwrap<(UserLite & { phone: string })[]>(
          supabase.rpc('match_contacts', { phones: phones.slice(i, i + 500) }),
        );
        matches.push(...rows.map((r) => ({ ...r, contactName: nameByPhone.get(r.phone) })));
      }
      setContactMatches(matches);
    } catch (e) {
      notify("Couldn't read contacts", String(e));
    } finally {
      setSyncing(false);
    }
  }

  function actionFor(u: UserLite) {
    const r = relation(u.id);
    if (r === 'friend') return <Text variant="small" color="accent">Friends</Text>;
    if (r === 'outgoing') return <Text variant="small" color="textSecondary">Requested</Text>;
    if (r === 'incoming') {
      const link = data!.links.find((l) => l.requester_id === u.id)!;
      return <Button title="Accept" small variant="accent" onPress={() => accept(link)} />;
    }
    return <Button title="Add" small onPress={() => add(u.id)} />;
  }

  return (
    <Screen>
      <Text variant="title">Friends</Text>
      <Field
        value={query}
        onChangeText={search}
        placeholder="Search by @username or phone number"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {results ? (
        results.length === 0 ? (
          <Text color="textSecondary">No one found. Invite them from the Bunch tab!</Text>
        ) : (
          results.map((u) => <UserRow key={u.id} id={u.id} name={u.name} username={u.username} photoUrl={u.photo_url} right={actionFor(u)} />)
        )
      ) : null}

      {Platform.OS !== 'web' ? (
        <Card style={{ gap: Spacing.two }}>
          <Text variant="label">Find friends from your contacts</Text>
          <Text variant="small" color="textSecondary">
            We check which of your contacts are on Banana. Numbers are only matched, never stored.
          </Text>
          <Button title={contactMatches ? 'Sync again' : 'Sync contacts'} small onPress={syncContacts} loading={syncing} />
        </Card>
      ) : null}
      {contactMatches?.map((u) => (
        <UserRow key={u.id} id={u.id} name={u.name} subtitle={u.contactName ? `${u.contactName} in your contacts` : undefined} photoUrl={u.photo_url} right={actionFor(u)} />
      ))}
      {contactMatches && contactMatches.length === 0 ? (
        <Text color="textSecondary">None of your contacts are on Banana yet.</Text>
      ) : null}

      {data && data.incoming.length > 0 ? <SectionTitle>Requests</SectionTitle> : null}
      {data?.incoming.map(({ link, user }) => (
        <UserRow
          key={link.id}
          id={link.requester_id}
          name={user?.name ?? 'Someone'}
          username={user?.username}
          photoUrl={user?.photo_url}
          right={
            <View style={{ gap: 6 }}>
              <Button title="Accept" small variant="accent" onPress={() => accept(link)} />
              <Button title="Decline" small variant="ghost" onPress={() => remove(link)} />
            </View>
          }
        />
      ))}
      {data && data.outgoing.length > 0 ? <SectionTitle>Sent</SectionTitle> : null}
      {data?.outgoing.map(({ link, user }) => (
        <UserRow
          key={link.id}
          id={link.addressee_id}
          name={user?.name ?? 'Someone'}
          username={user?.username}
          photoUrl={user?.photo_url}
          right={<Button title="Cancel" small variant="ghost" onPress={() => remove(link)} />}
        />
      ))}

      <SectionTitle>Your friends ({data?.friends.length ?? 0})</SectionTitle>
      {data && data.friends.length === 0 ? (
        <Empty title="No friends yet" body="Search above to add people you know." />
      ) : (
        data?.friends.map((f) => (
          <UserRow key={f.id} id={f.id} name={f.name} username={f.username} photoUrl={f.photo_url} certified={!!f.certified_at} />
        ))
      )}
    </Screen>
  );
}
