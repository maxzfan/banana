// Normalize to E.164 digits without "+" (matches auth.users.phone). Assumes US (+1) for 10-digit numbers.
export function normalizePhone(input: string): string | null {
  const hasPlus = input.trim().startsWith('+');
  const digits = input.replace(/\D/g, '');
  if (!hasPlus && digits.length === 10) return `1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}
