// Per-level star-rating time thresholds — placeholder formula per spec, not
// sacred. Kept in one place so it's easy to tune.
// 3★: bumps === 0 AND time <= threeStarSec
// 2★: bumps <= 2 (regardless of time)
// 1★: any other successful park
export const STAR_THRESHOLDS = {
  'pull-in-01': { threeStarSec: 30 },
  'reverse-01': { threeStarSec: 40 },
  'parallel-01': { threeStarSec: 50 },
};

export const DEFAULT_THREE_STAR_SEC = 40;
