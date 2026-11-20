import { View } from 'react-native';

import { Text } from '@/components/ui';
import { Fonts, Palette } from '@/constants/theme';

// Banana-sticker style badge: round, tilted, with a dashed die-cut edge.
export function CertifiedSticker({ size = 56 }: { size?: number }) {
  return (
    <View
      accessibilityLabel="Certified by their Bunch"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        padding: size * 0.05,
        transform: [{ rotate: '-12deg' }],
        boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
      }}>
      <View
        style={{
          flex: 1,
          borderRadius: size / 2,
          backgroundColor: Palette.leaf,
          borderWidth: Math.max(1.5, size * 0.04),
          borderStyle: 'dashed',
          borderColor: Palette.banana,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ fontFamily: Fonts.bold, color: Palette.banana, fontSize: size * 0.17, lineHeight: size * 0.2 }}>
          CERTIFIED
        </Text>
        {size >= 48 ? (
          <Text style={{ fontFamily: Fonts.semibold, color: '#FFFFFF', fontSize: size * 0.11, lineHeight: size * 0.14 }}>
            by the Bunch
          </Text>
        ) : null}
      </View>
    </View>
  );
}
