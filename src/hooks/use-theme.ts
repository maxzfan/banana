import { Colors, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme(): ThemeColors & { dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { ...(dark ? Colors.dark : Colors.light), dark };
}
