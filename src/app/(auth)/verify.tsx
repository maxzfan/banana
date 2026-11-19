import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Field, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify(token = code) {
    if (token.length < 6) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token, type: 'sms' });
    setLoading(false);
    if (error) setError(error.message);
    // On success the auth guard moves us on automatically.
  }

  return (
    <Screen>
      <Text variant="title">Enter your code</Text>
      <Text color="textSecondary">Sent to +{phone}</Text>
      <Field
        label="6-digit code"
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) verify(digits);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={6}
        style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flex: 1 }} />
      <Button title="Verify" onPress={() => verify()} loading={loading} disabled={code.length < 6} />
      <Button
        title="Resend code"
        variant="ghost"
        onPress={() => supabase.auth.signInWithOtp({ phone: `+${phone}` })}
      />
      <Button title="Use a different number" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
