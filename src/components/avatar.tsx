import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { Fonts, Palette } from '@/constants/theme';

export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Palette.banana,
        borderWidth: Math.max(2, size / 24),
        borderColor: Palette.peel,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Text style={{ fontFamily: Fonts.bold, fontSize: size * 0.42, color: Palette.ink }}>{initial}</Text>
      )}
    </View>
  );
}
