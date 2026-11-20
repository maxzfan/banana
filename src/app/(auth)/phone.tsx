import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Field, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { normalizePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function Phone() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    const normalized = normalizePhone(phone);
    if (!normalized) return setError('Enter a valid phone number');
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+${normalized}` });
    setLoading(false);
    if (error) return setError(error.message);
    router.push({ pathname: '/verify', params: { phone: normalized } });
  }

  return (
    <Screen>
      <Text variant="title">{"What's your number?"}</Text>
      <Text color="textSecondary">{"We'll text you a code. Your number is never shown on your profile."}</Text>
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="(555) 000-0001"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        autoFocus
        onSubmitEditing={send}
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flex: 1 }} />
      <Button title="Send code" onPress={send} loading={loading} disabled={!phone} />
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
      <View style={{ height: Spacing.two }} />
    </Screen>
  );
}
