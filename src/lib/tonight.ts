import type { TonightAudience } from '@/lib/types';

// Going Bananas resets at the next 4am in the user's local time.
export function nextFourAm(now = new Date()) {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

export const AUDIENCES: { value: TonightAudience; label: string }[] = [
  { value: 'friends', label: 'All friends' },
  { value: 'ripe', label: 'Ripe friends' },
  { value: 'bunch', label: 'My Bunch' },
];
