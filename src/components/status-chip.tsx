import { View } from 'react-native';

import { Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { STATUSES } from '@/lib/status';
import type { BananaStatus } from '@/lib/types';

export function StatusChip({ status, large }: { status: BananaStatus | null; large?: boolean }) {
  if (!status) {
    return (
      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, opacity: 0.6 }}>
        <Text variant="caption" color="textSecondary">
          Hidden
        </Text>
      </View>
    );
  }
  const s = STATUSES[status];
  return (
    <View
      style={{
        backgroundColor: s.color,
        paddingHorizontal: large ? 16 : 10,
        paddingVertical: large ? 8 : 4,
        borderRadius: Radius.pill,
        alignSelf: 'flex-start',
      }}>
      <Text variant={large ? 'label' : 'caption'} style={{ color: s.fg }}>
        {s.label}
        {large ? ` · ${s.meaning}` : ''}
      </Text>
    </View>
  );
}
