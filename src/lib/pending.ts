import 'expo-sqlite/localStorage/install';

// Survives the sign-up flow so invited validators land on the survey afterwards.
const KEY = 'banana.pendingInvite';

export const pendingInvite = {
  get: () => localStorage.getItem(KEY),
  set: (token: string) => localStorage.setItem(KEY, token),
  clear: () => localStorage.removeItem(KEY),
};

export const onboardingFlags = { showStatusPicker: false };
