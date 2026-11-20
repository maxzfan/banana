import { router } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import { Button, Screen, Text } from '@/components/ui';

export default function EditProfile() {
  return (
    <Screen>
      <Text variant="title">Edit profile</Text>
      <ProfileForm submitLabel="Save" onSaved={() => router.back()} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
