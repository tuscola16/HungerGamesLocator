/**
 * ROADMAP #92: does this look like a real 6-character game code?
 *
 * Both GM surfaces render `game?.playerCode ?? '…'`, so before the game doc resolves the QR
 * would otherwise encode the literal ellipsis — invisible to a scanner, which has no way to
 * tell a placeholder from a real code the way a human reading "…" does. Shared so the phone
 * and the dashboard agree on what is worth drawing.
 */
export function isJoinCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/i.test(code);
}

/** The deep link a join QR encodes. `app/(app)/join.tsx` reads the `code` param. */
export function joinDeepLink(code: string): string {
  return `outdoorgm://join?code=${encodeURIComponent(code)}`;
}
