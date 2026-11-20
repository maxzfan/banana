import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CertifiedSticker } from '@/components/certified-sticker';
import { StatusChip } from '@/components/status-chip';
import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { BananaStatus } from '@/lib/types';

export function UserRow({
  id,
  name,
  username,
  photoUrl,
  status,
  certified,
  subtitle,
  right,
}: {
  id: string;
  name: string | null;
  username?: string | null;
  photoUrl?: string | null;
  status?: BananaStatus | null;
  certified?: boolean;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 12 }}>
      <Link href={`/user/${id}` as Href} asChild>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flex: 1 }}>
          <Avatar uri={photoUrl} name={name} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label" numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Text variant="small" color="textSecondary" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : username ? (
              <Text variant="small" color="textSecondary" numberOfLines={1}>
                @{username}
              </Text>
            ) : null}
            {status !== undefined ? <StatusChip status={status} /> : null}
          </View>
          {certified ? <CertifiedSticker size={44} /> : null}
        </Pressable>
      </Link>
      {right}
    </Card>
  );
}
