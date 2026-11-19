import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'body' | 'title' | 'hero' | 'subtitle' | 'label' | 'small' | 'caption';

export function Text({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: ThemeColor | (string & {}) }) {
  const theme = useTheme();
  const c = color ? ((theme as unknown as Record<string, string>)[color] ?? color) : theme.text;
  return <RNText style={[textStyles[variant], { color: c }, style]} {...rest} />;
}

const textStyles = StyleSheet.create({
  hero: { fontFamily: Fonts.bold, fontSize: 44, lineHeight: 50 },
  title: { fontFamily: Fonts.bold, fontSize: 28, lineHeight: 34 },
  subtitle: { fontFamily: Fonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: Fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
});

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  style,
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const theme = useTheme();
  const inner = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.background }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}>
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger' | 'outline';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  small,
  style,
  ...rest
}: Omit<PressableProps, 'style'> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = {
    primary: theme.primary,
    accent: theme.accent,
    ghost: 'transparent',
    danger: theme.danger,
    outline: 'transparent',
  }[variant];
  const fg = {
    primary: theme.onPrimary,
    accent: theme.onAccent,
    ghost: theme.text,
    danger: '#FFFFFF',
    outline: theme.text,
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: bg,
          borderColor: variant === 'outline' ? theme.border : 'transparent',
          opacity: isDisabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        variant === 'primary' && styles.buttonShadow,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant="label" style={{ color: fg, fontSize: small ? 14 : 17 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      {label ? (
        <Text variant="small" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
          rest.multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 14 },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  fg,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  fg?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? (color ?? theme.primary) : theme.backgroundElement,
          borderColor: selected ? (color ?? theme.primary) : theme.border,
        },
      ]}>
      <Text variant="small" style={{ color: selected ? (fg ?? theme.onPrimary) : theme.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between', marginTop: Spacing.three }]}>
      <Text variant="subtitle">{children}</Text>
      {right}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five }}>
      <Text variant="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text color="textSecondary" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action}
    </Card>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ padding: Spacing.five, alignItems: 'center' }}>
      <ActivityIndicator color={theme.brown} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text variant="small" color="danger">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: Spacing.three },
  buttonShadow: {
    boxShadow: '0px 4px 0px #D9A400',
  },
  card: { borderRadius: Radius.md, borderWidth: 2, padding: Spacing.three, gap: Spacing.two },
  input: {
    borderWidth: 2,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    fontFamily: Fonts.medium,
    fontSize: 17,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
