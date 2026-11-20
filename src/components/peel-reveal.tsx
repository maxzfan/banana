import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

const PEELS = [-118, -42, 42, 118];

// Four banana-peel strips fold open from the bottom whenever `revealKey` changes.
export function PeelReveal({ revealKey, children, size = 160 }: { revealKey: string; children: ReactNode; size?: number }) {
  const progress = useSharedValue(1);
  const pop = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.4)) });
    pop.value = withSequence(withTiming(0.7, { duration: 0 }), withDelay(250, withSpring(1, { damping: 8 })));
  }, [revealKey, progress, pop]);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {PEELS.map((angle, i) => (
        <Peel key={i} angle={angle} progress={progress} size={size} />
      ))}
      <Animated.View style={contentStyle}>{children}</Animated.View>
    </View>
  );
}

function Peel({ angle, progress, size }: { angle: number; progress: { value: number }; size: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.75,
    transform: [{ rotate: `${angle * progress.value}deg` }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'flex-end', transformOrigin: 'bottom' },
        style,
      ]}>
      <View
        style={{
          width: size * 0.32,
          height: size * 0.6,
          backgroundColor: Palette.banana,
          borderTopLeftRadius: size * 0.2,
          borderTopRightRadius: size * 0.2,
          borderBottomLeftRadius: size * 0.06,
          borderBottomRightRadius: size * 0.06,
          borderWidth: 2,
          borderColor: Palette.bananaDeep,
        }}
      />
    </Animated.View>
  );
}
