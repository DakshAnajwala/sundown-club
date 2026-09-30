/**
 * Whether window.__game (debugTeleport, debugTick, …) is exposed. One flag,
 * read by main.js (to expose them) and by the leaderboard (to refuse runs
 * from a page that has them), so the two can never disagree.
 */
export const DEBUG_HOOKS =
  import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
