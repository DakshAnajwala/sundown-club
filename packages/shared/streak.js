/**
 * streak.js — the forgiving streak. Pure functions over a plain object, so the
 * rules are checked in node (tools/daily-check.mjs). Spec: docs/retention/SPEC-daily.md §3.
 *
 * A day is "earned" by 5 minutes of play or one finished daily quest. A missed
 * day is covered by a freeze when there is one (earned 1 per 7 days, hold 3),
 * skipped when it is the player's chosen rest weekday, and only otherwise ends
 * the run. A broken run can be restored once a month with a token. All dates
 * are local calendar days as YYYY-MM-DD strings.
 */

export const MAX_FREEZES = 3;
export const FREEZE_EVERY = 7;
export const WEEK_TARGET = 4;
export const RESTORE_WINDOW_DAYS = 2;

const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function addDaysStr(day, n) { const d = parse(day); d.setDate(d.getDate() + n); return fmt(d); }
export function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function weekdayOf(day) { return parse(day).getDay(); }            // 0 Sunday .. 6 Saturday
export function weekStart(day) { const d = parse(day); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmt(d); }   // Monday

export function normalizeStreak(s) {
  const o = s && typeof s === 'object' ? s : {};
  const days = Math.max(0, Math.floor(Number(o.days) || 0));
  const w = o.weekly && typeof o.weekly === 'object' ? o.weekly : {};
  const b = o.broke && typeof o.broke === 'object' && ok(o.broke.on) ? { days: Math.max(0, Math.floor(Number(o.broke.days) || 0)), on: o.broke.on } : null;
  return {
    days,
    last: ok(o.last) ? o.last : null,
    best: Math.max(days, Math.floor(Number(o.best) || 0)),
    freezes: Math.min(MAX_FREEZES, Math.max(0, Math.floor(Number(o.freezes) || 0))),
    rest: Number.isInteger(o.rest) && o.rest >= 0 && o.rest <= 6 ? o.rest : null,
    broke: b,
    restored: typeof o.restored === 'string' && /^\d{4}-\d{2}$/.test(o.restored) ? o.restored : null,
    covered: (Array.isArray(o.covered) ? o.covered : []).filter(ok).slice(-5),
    weekly: {
      count: Math.max(0, Math.floor(Number(w.count) || 0)),
      key: ok(w.key) ? w.key : null,
      cur: ok(w.cur) ? w.cur : null,
      n: Math.max(0, Math.floor(Number(w.n) || 0)),
    },
  };
}

/**
 * Settle every day between the last earned day and today (exclusive). Call it
 * once when the club opens. Returns { streak, events } where events are
 * { type: 'saved', day } (a freeze covered it) or { type: 'broken', days }.
 */
export function rollStreak(streak, today) {
  const s = normalizeStreak(streak);
  const events = [];
  if (!s.last || s.last >= today || s.days === 0) return { streak: s, events };
  const missed = daysBetween(s.last, today) - 1;
  if (missed <= 0) return { streak: s, events };
  let broken = false;
  for (let i = 1; i <= missed; i++) {
    const day = addDaysStr(s.last, i);
    if (s.rest !== null && weekdayOf(day) === s.rest) continue;
    if (s.freezes > 0) { s.freezes -= 1; s.covered = [...s.covered, day].slice(-5); events.push({ type: 'saved', day }); continue; }
    s.broke = { days: s.days, on: day };
    events.push({ type: 'broken', days: s.days });
    s.days = 0;
    broken = true;
    break;
  }
  if (!broken) s.last = addDaysStr(today, -1);   // the run carries to yesterday
  return { streak: s, events };
}

/** Count today. Events: 'started', 'extended', 'freeze_earned', 'week_counted'. No-op when already counted. */
export function earnDay(streak, today) {
  let { streak: s, events } = rollStreak(streak, today);
  if (s.last === today) return { streak: s, events };
  s.days = s.last === addDaysStr(today, -1) && s.days > 0 ? s.days + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best, s.days);
  events.push({ type: s.days > 1 ? 'extended' : 'started', days: s.days });
  if (s.days % FREEZE_EVERY === 0 && s.freezes < MAX_FREEZES) { s.freezes += 1; events.push({ type: 'freeze_earned', freezes: s.freezes }); }
  const wk = weekStart(today);
  if (s.weekly.cur !== wk) { s.weekly.cur = wk; s.weekly.n = 0; }
  s.weekly.n += 1;
  if (s.weekly.n === WEEK_TARGET) {
    s.weekly.count = s.weekly.key === addDaysStr(wk, -7) ? s.weekly.count + 1 : 1;
    s.weekly.key = wk;
    events.push({ type: 'week_counted', weeks: s.weekly.count });
  }
  return { streak: s, events };
}

/** Weeks in a row with 4+ active days, counting only a week that is still alive. */
export function weeklyCount(streak, today) {
  const s = normalizeStreak(streak);
  const wk = weekStart(today);
  return s.weekly.key === wk || s.weekly.key === addDaysStr(wk, -7) ? s.weekly.count : 0;
}

/** Can a broken run be restored now? Returns { ok, reason? } (reasons: nothing, late, month, tokens). */
export function canRestore(streak, today, tokens) {
  const s = normalizeStreak(streak);
  if (!s.broke || s.broke.days < 2) return { ok: false, reason: 'nothing' };
  if (daysBetween(s.broke.on, today) > RESTORE_WINDOW_DAYS) return { ok: false, reason: 'late' };
  if (s.restored === today.slice(0, 7)) return { ok: false, reason: 'month' };
  if (!(tokens >= 1)) return { ok: false, reason: 'tokens' };
  return { ok: true };
}

/** Restore the broken run (the caller takes the token). If today is already counted it counts too. */
export function restoreStreak(streak, today, tokens) {
  const s = normalizeStreak(streak);
  const can = canRestore(s, today, tokens);
  if (!can.ok) return { streak: s, ...can };
  const back = s.broke.days;
  if (s.last === today) { s.days = back + 1; } else { s.days = back; s.last = addDaysStr(today, -1); }
  s.best = Math.max(s.best, s.days);
  s.broke = null;
  s.restored = today.slice(0, 7);
  return { streak: s, ok: true };
}

export function setRestDay(streak, weekday) {
  const s = normalizeStreak(streak);
  s.rest = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null;
  return s;
}

/** Is the run alive today (counted today, or could still be counted without a break)? For the hub display. */
export function runLength(streak, today) {
  const { streak: s } = rollStreak(streak, today);
  return s.days > 0 && (s.last === today || s.last === addDaysStr(today, -1)) ? s.days : 0;
}
