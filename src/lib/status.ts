import { Palette } from '@/constants/theme';
import type { BananaStatus } from '@/lib/types';

export const STATUSES: Record<
  BananaStatus,
  { label: string; meaning: string; color: string; fg: string; question?: string }
> = {
  ripe: { label: 'Ripe', meaning: 'Single', color: Palette.banana, fg: Palette.ink, question: 'actually single' },
  picked: { label: 'Picked', meaning: 'Taken', color: Palette.leaf, fg: '#FFFFFF', question: 'actually taken' },
  bruised: {
    label: 'Bruised',
    meaning: "It's complicated",
    color: Palette.bruise,
    fg: '#FFFFFF',
    question: 'really in an "it\'s complicated" situation',
  },
  peel_sealed: { label: 'Peel Sealed', meaning: 'Not sharing', color: Palette.peel, fg: '#FFFFFF' },
};

export const STATUS_ORDER: BananaStatus[] = ['ripe', 'picked', 'bruised', 'peel_sealed'];

export const VISIBILITY_OPTIONS = [
  { value: 'friends', label: 'All friends' },
  { value: 'bunch', label: 'My Bunch only' },
  { value: 'private', label: 'Only me' },
] as const;

export const FUN_QUESTIONS = [
  "What's {name}'s best quality on a date?",
  'Describe {name} in one word.',
  "What's {name}'s most lovable red flag?",
  "What's the ideal first date for {name}?",
];
