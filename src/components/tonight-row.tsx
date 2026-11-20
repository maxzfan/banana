import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, Text } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { TonightPost } from '@/lib/types';

const CARD_W = 168;

export function TonightRow() {
  const { userId, profile } = useMe();
  const theme = useTheme();
  const [joining, setJoining] = useState<string | null>(null);
  const { data, reload } = useAsync(() => unwrap<TonightPost[]>(supabase.rpc('tonight_feed')));
  useRealtime(['tonight_posts', 'tonight_joins'], reload);

  const posts = data ?? [];
  const mine = posts.find((p) => p.user_id === userId);
  const others = posts.filter((p) => p.user_id !== userId);

  async function join(p: TonightPost) {
    if (p.chat_id) return router.push(`/chat/${p.chat_id}` as Href);
    setJoining(p.post_id);
    const { data: chatId, error } = await supabase.rpc('join_tonight', { post: p.post_id });
    setJoining(null);
    if (error) return notify("Couldn't join", error.message);
    router.push(`/chat/${chatId}` as Href);
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <Text variant="label">Tonight</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.two }}>
        <Pressable onPress={() => router.push('/tonight' as Href)}>
          <View
            style={{
              width: CARD_W,
              minHeight: 150,
              borderRadius: Radius.lg,
              padding: Spacing.three,
              gap: Spacing.one,
              backgroundColor: mine ? Palette.leaf : theme.card,
              borderWidth: 2,
              borderColor: mine ? Palette.leaf : Palette.banana,
              borderStyle: mine ? 'solid' : 'dashed',
            }}>
            <Avatar uri={profile?.photo_url} name={profile?.name} size={40} />
            <Text variant="label" style={{ color: mine ? '#fff' : undefined }}>
              {mine ? "You're going bananas" : 'Free tonight?'}
            </Text>
            <Text variant="small" numberOfLines={2} style={{ color: mine ? '#fff' : theme.textSecondary }}>
              {mine ? (mine.note ?? `${mine.join_count} in so far`) : 'Tap to tell friends'}
            </Text>
            {mine ? (
              <Text variant="caption" style={{ color: '#fff' }}>
                {mine.join_count} in · tap to edit
              </Text>
            ) : null}
          </View>
        </Pressable>
        {others.map((p) => (
          <View
            key={p.post_id}
            style={{
              width: CARD_W,
              minHeight: 150,
              borderRadius: Radius.lg,
              padding: Spacing.three,
              gap: Spacing.one,
              backgroundColor: Palette.banana,
            }}>
            <Pressable onPress={() => router.push(`/user/${p.user_id}` as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <Avatar uri={p.photo_url} name={p.name} size={36} />
              <Text variant="label" numberOfLines={1} style={{ color: Palette.ink, flex: 1 }}>
                {p.name}
              </Text>
            </Pressable>
            <Text variant="small" numberOfLines={3} style={{ color: Palette.ink, flex: 1 }}>
              {p.note ?? 'Free tonight!'}
            </Text>
            <Button
              title={p.joined ? `Chat · ${p.join_count} in` : "I'm in"}
              small
              variant={p.joined ? 'outline' : 'accent'}
              loading={joining === p.post_id}
              onPress={() => join(p)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
