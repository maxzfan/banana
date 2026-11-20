import 'expo-sqlite/localStorage/install';

// Survives the sign-up flow so invited validators land on the survey afterwards.
const KEY = 'banana.pendingInvite';

export const pendingInvite = {
  get: () => localStorage.getItem(KEY),
  set: (token: string) => localStorage.setItem(KEY, token),
  clear: () => localStorage.removeItem(KEY),
};

export const onboardingFlags = { showStatusPicker: false };

// New (non-invited) users see the status picker once, right after onboarding.
export function takeStatusPickerFlag() {
  const show = onboardingFlags.showStatusPicker;
  onboardingFlags.showStatusPicker = false;
  return show;
}
