import { ProfileForm } from '@/components/profile-form';
import { Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { onboardingFlags, pendingInvite } from '@/lib/pending';

export default function Onboarding() {
  const { signOut } = useAuth();
  const invited = !!pendingInvite.get();
  return (
    <Screen>
      <Text variant="title">Make your profile</Text>
      <Text color="textSecondary">
        {invited ? 'Quick setup, then you can answer the survey.' : 'This is what your friends will see.'}
      </Text>
      <ProfileForm
        submitLabel={invited ? 'Continue to survey' : 'Continue'}
        onSaved={() => {
          if (!invited) onboardingFlags.showStatusPicker = true;
        }}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
