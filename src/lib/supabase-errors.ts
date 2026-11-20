export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong';
}
