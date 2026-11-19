import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CertifiedSticker } from '@/components/certified-sticker';
import { StatusChip } from '@/components/status-chip';
import { Button, Card, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useMe } from '@/lib/auth';
import { VISIBILITY_OPTIONS } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { FriendRow } from '@/lib/types';

export default function Me() {
  const { profile, status } = useMe();
  const { data: friends } = useAsync(() => unwrap<FriendRow[]>(supabase.rpc('friends_with_status')));
  if (!profile) return null;
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: Spacing.two }}>
        <View>
          <Avatar uri={profile.photo_url} name={profile.name} size={120} />
          {status?.certified_at ? (
            <View style={{ position: 'absolute', right: -16, bottom: -6 }}>
              <CertifiedSticker size={60} />
            </View>
          ) : null}
        </View>
        <Text variant="title">{profile.name}</Text>
        <Text color="textSecondary">@{profile.username}</Text>
        {status ? <StatusChip status={status.status} large /> : null}
        {profile.bio ? <Text style={{ textAlign: 'center' }}>{profile.bio}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="title">{friends?.length ?? '–'}</Text>
          <Text variant="small" color="textSecondary">Friends</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="title">{profile.setups_made}</Text>
          <Text variant="small" color="textSecondary">Set-ups made</Text>
        </Card>
      </View>
      {status ? (
        <Text variant="small" color="textSecondary" style={{ textAlign: 'center' }}>
          Status visible to: {VISIBILITY_OPTIONS.find((o) => o.value === status.visibility)?.label}
        </Text>
      ) : null}
      <Button title="Change status" onPress={() => router.push('/set-status' as Href)} />
      <Button title="Edit profile" variant="outline" onPress={() => router.push('/edit-profile' as Href)} />
      <Button title="Settings & privacy" variant="outline" onPress={() => router.push('/settings' as Href)} />
    </Screen>
  );
}
