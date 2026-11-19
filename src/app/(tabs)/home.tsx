import { Link, router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { StatusChip } from '@/components/status-chip';
import { UserRow } from '@/components/user-row';
import { Button, Chip, Empty, Loading, Screen, Text } from '@/components/ui';
import { Fonts, Palette, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { useMe } from '@/lib/auth';
import { STATUSES } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { BananaStatus, FriendRow } from '@/lib/types';

type Filter = 'all' | BananaStatus | 'certified';
const FILTERS: Filter[] = ['all', 'ripe', 'picked', 'bruised', 'certified'];

export default function Home() {
  const { profile, status } = useMe();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, loading, reload } = useAsync(() => unwrap<FriendRow[]>(supabase.rpc('friends_with_status')));
  useRealtime(['statuses', 'friendships'], reload);

  const friends = useMemo(() => {
    const all = data ?? [];
    if (filter === 'all') return all;
    if (filter === 'certified') return all.filter((f) => f.certified_at);
    return all.filter((f) => f.status === filter);
  }, [data, filter]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: Fonts.bold, fontSize: 36, color: Palette.peel }}>Banana</Text>
        <Link href={'/me' as Href} asChild>
          <Pressable>
            <Avatar uri={profile?.photo_url} name={profile?.name} size={40} />
          </Pressable>
        </Link>
      </View>

      <Pressable onPress={() => router.push('/set-status' as Href)}>
        <View
          style={{
            backgroundColor: status ? STATUSES[status.status].color : Palette.banana,
            borderRadius: 24,
            padding: Spacing.three,
            gap: Spacing.one,
          }}>
          <Text variant="caption" style={{ color: status ? STATUSES[status.status].fg : Palette.ink, opacity: 0.8 }}>
            YOUR STATUS · TAP TO CHANGE
          </Text>
          <Text variant="title" style={{ color: status ? STATUSES[status.status].fg : Palette.ink }}>
            {status ? `${STATUSES[status.status].label} · ${STATUSES[status.status].meaning}` : '—'}
          </Text>
        </View>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: Spacing.two, alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === 'all' ? 'Everyone' : f === 'certified' ? 'Certified' : STATUSES[f].label}
            selected={filter === f}
            color={f === 'all' || f === 'certified' ? undefined : STATUSES[f].color}
            fg={f === 'all' || f === 'certified' ? undefined : STATUSES[f].fg}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      {loading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <Empty
          title="No friends yet"
          body="Add friends to see their statuses here."
          action={<Button title="Find friends" small onPress={() => router.push('/friends' as Href)} />}
        />
      ) : friends.length === 0 ? (
        <Empty title="Nobody here" body="No friends match this filter right now." />
      ) : (
        friends.map((f) => (
          <UserRow
            key={f.id}
            id={f.id}
            name={f.name}
            username={f.username}
            photoUrl={f.photo_url}
            status={f.status}
            certified={!!f.certified_at}
          />
        ))
      )}
      {status && status.status !== 'peel_sealed' && !status.certified_at ? (
        <Pressable onPress={() => router.push('/bunch' as Href)}>
          <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center', justifyContent: 'center' }}>
            <StatusChip status={status.status} />
            <Text variant="small" color="brown">
              Get Certified by your Bunch →
            </Text>
          </View>
        </Pressable>
      ) : null}
    </Screen>
  );
}
