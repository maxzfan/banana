import { router } from 'expo-router';
import { View } from 'react-native';

import { CertifiedSticker } from '@/components/certified-sticker';
import { PeelReveal } from '@/components/peel-reveal';
import { Button, Screen, Text } from '@/components/ui';
import { Fonts, Palette, Spacing } from '@/constants/theme';

export default function Welcome() {
  return (
    <Screen style={{ justifyContent: 'space-between', paddingVertical: Spacing.five }}>
      <View style={{ alignItems: 'center', gap: Spacing.three, marginTop: Spacing.five }}>
        <PeelReveal revealKey="welcome" size={180}>
          <CertifiedSticker size={96} />
        </PeelReveal>
        <Text style={{ fontFamily: Fonts.bold, fontSize: 64, lineHeight: 70, color: Palette.peel }}>Banana</Text>
        <Text variant="subtitle" style={{ textAlign: 'center' }}>
          Your relationship status,{'\n'}vouched for by your Bunch.
        </Text>
      </View>
      <View style={{ gap: Spacing.two }}>
        <Button title="Get started" onPress={() => router.push('/phone')} />
        <Text variant="small" color="textSecondary" style={{ textAlign: 'center' }}>
          Sign up or log in with your phone number
        </Text>
      </View>
    </Screen>
  );
}
