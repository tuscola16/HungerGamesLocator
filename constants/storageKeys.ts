/**
 * AsyncStorage keys shared across screens. Kept in one place because a drifting key
 * string fails silently — the reader just never finds what the writer stored.
 */

/**
 * ROADMAP #92: a join deep link (`outdoorgm://join?code=…`) that lands while the user is
 * signed out is bounced to the login screen by `app/(app)/_layout.tsx`, which drops the
 * query string. The layout stashes the code here first so the Join screen can still
 * pre-fill it once the user is authenticated. Consumed (and cleared) by
 * `app/(app)/join.tsx`.
 */
export const PENDING_JOIN_CODE_KEY = 'pending_join_code';
