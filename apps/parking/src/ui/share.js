/**
 * share.js — hand a link (and optional text) to the player's own share sheet
 * or clipboard. The page itself sends nothing anywhere.
 *
 * Used by the homepage and the game, so the URL and the fallbacks live once.
 */
export const SITE_URL = 'https://parking-precision.vercel.app/';

/**
 * @param {{ title?: string, text?: string, url?: string, sheet?: 'always'|'touch' }} o
 *   sheet: when to prefer the OS share sheet. 'touch' keeps desktops on the
 *   clipboard, where a share sheet is an odd surprise.
 * @returns {Promise<'shared'|'copied'|'aborted'|'failed'>}
 */
export async function share({ title = 'Parking Precision', text, url = SITE_URL, sheet = 'always' } = {}) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const useSheet = navigator.share && (sheet === 'always' || coarse);
  try {
    if (useSheet) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
    return 'copied';
  } catch (err) {
    return err?.name === 'AbortError' ? 'aborted' : 'failed';
  }
}
