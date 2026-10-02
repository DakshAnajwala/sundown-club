/** Pure-logic check: profile v2 (migration, levels, items) and the save code. node tools/profile-check.mjs */
import assert from 'node:assert/strict';

class Store {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new Store();
const P = await import('../packages/shared/profile.js');
const S = await import('../packages/shared/save.js');
let n = 0;
const ok = (fn) => { fn(); n++; };
const fresh = () => { globalThis.localStorage = new Store(); };
const ID = '52f37248-f49e-422b-8cd4-ba2618c73d09';

ok(() => { // v1 -> v2 keeps everything and leaves the old key
  fresh();
  const v1 = { id: ID, handle: 'Warm Tern', xp: 1340, streak: { days: 3, last: '2026-09-30' }, games: { blackjack: { lastPlayed: 5, timeMs: 9000, resume: 'x', facts: [['1', 'a']], ledger: { peak: 4100 } } } };
  localStorage.setItem(P.OLD_KEY, JSON.stringify(v1));
  const p = P.readProfile();
  assert.equal(p.v, 2); assert.equal(p.id, ID); assert.equal(p.handle, 'Warm Tern'); assert.equal(p.xp, 1340);
  assert.equal(p.streak.days, 3); assert.equal(p.streak.last, '2026-09-30'); assert.equal(p.streak.best, 3); assert.equal(p.streak.freezes, 0);
  assert.deepEqual(p.games, v1.games);
  assert.equal(localStorage.getItem(P.OLD_KEY), JSON.stringify(v1), 'old key untouched');
  assert.ok(localStorage.getItem(P.KEY), 'v2 written');
});
ok(() => { // junk never throws
  for (const junk of ['{', 'null', '[]', '"x"', '{"xp":"lots","streak":5,"games":[],"badges":"no"}']) {
    fresh(); localStorage.setItem(P.KEY, junk);
    const p = P.readProfile();
    assert.equal(p.xp, 0); assert.deepEqual(p.games, {}); assert.deepEqual(p.badges, []); assert.equal(p.streak.days, 0);
  }
});
ok(() => { // identity survives a game write
  fresh();
  const a = P.ensureIdentity();
  P.updateGame('holdem', { resume: 'r' });
  const p = P.readProfile();
  assert.equal(p.id, a.id); assert.equal(p.handle, a.handle); assert.ok(p.createdAt);
  assert.equal(p.streak.days, 0, 'a game write alone no longer counts the day');
});
ok(() => { // five minutes of play earn the day
  fresh(); P.ensureIdentity();
  P.updateGame('holdem', { timeMs: 120000 });
  assert.equal(P.readProfile().streak.days, 0); assert.equal(P.readProfile().daily.playMs, 120000);
  P.updateGame('holdem', { timeMs: 330000 });
  const p = P.readProfile();
  assert.equal(p.streak.days, 1); assert.equal(p.streak.last, P.today()); assert.equal(p.daily.quests.length, 3);
  P.updateGame('holdem', { timeMs: 900000 });
  assert.equal(P.readProfile().streak.days, 1, 'counted once a day');
});
ok(() => { // level curve
  assert.deepEqual(P.levelFor(0), { level: 1, into: 0, next: 250 });
  assert.equal(P.levelFor(249).level, 1); assert.equal(P.levelFor(250).level, 2);
  assert.deepEqual(P.levelFor(250 + 299), { level: 2, into: 299, next: 300 });
  let total = 0; for (let l = 1; l < 100; l++) total += P.xpToNext(l);
  assert.equal(P.levelFor(total).level, 100); assert.equal(P.levelFor(total - 1).level, 99);
  assert.deepEqual(P.levelFor(total + 5000), { level: 100, into: 5000, next: 0 });
  assert.equal(P.levelFor(-5).level, 1);
});
ok(() => { // titles
  assert.equal(P.titleFor(1), 'Newcomer'); assert.equal(P.titleFor(4), 'Newcomer'); assert.equal(P.titleFor(5), 'Regular');
  assert.equal(P.titleFor(59), 'Old Hand'); assert.equal(P.titleFor(100), 'Keeper of the Lamp');
});
ok(() => { // xp, tokens, items
  fresh(); P.ensureIdentity();
  let r = P.grantXp(240); assert.equal(r.leveled, false);
  r = P.grantXp(20); assert.equal(r.leveled, true); assert.equal(r.level, 2); assert.equal(r.from, 1);
  assert.equal(P.grantXp(-99999).xp, 0);
  assert.equal(P.addTokens(500), 99); assert.equal(P.addTokens(-1000), 0);
  assert.equal(P.grantItem('cardback.dusk'), true); assert.equal(P.grantItem('cardback.dusk'), false);
  assert.equal(P.grantItem('Bad Id!'), false);
  assert.deepEqual(P.equip('cardBack', 'cardback.dusk'), { cardBack: 'cardback.dusk' });
  assert.deepEqual(P.equip('cardBack', 'not.owned'), { cardBack: 'cardback.dusk' });
  assert.deepEqual(P.equip('cardBack', null), {});
  P.grantItem('b1'); P.grantItem('b2'); P.grantItem('b3'); P.grantItem('b4');
  assert.deepEqual(P.setBadges(['b1', 'b1', 'zzz', 'b2', 'b3', 'b4']), ['b1', 'b2', 'b3']);
  assert.equal(P.markFound('ach.first-win'), true); assert.equal(P.markFound('ach.first-win'), false);
  assert.ok(P.readProfile().found['cardback.dusk']);
});
ok(() => { // unknown keys from newer code survive a game write
  fresh(); P.ensureIdentity();
  const raw = JSON.parse(localStorage.getItem(P.KEY)); raw.future = { claimed: '2026-10-02' }; localStorage.setItem(P.KEY, JSON.stringify(raw));
  P.updateGame('videopoker', {});
  assert.deepEqual(P.readProfile().future, { claimed: '2026-10-02' });
});

// ------------------------------------------------------------ save codes
ok(() => { // round trip, only club keys
  fresh(); P.ensureIdentity(); P.grantXp(500);
  localStorage.setItem('club.v1.chips', '{"chips":1234}');
  localStorage.setItem('parking-precision:progress:v4', '{"a":1}');
  localStorage.setItem('someone.else', 'secret');
  const text = S.exportSave(localStorage);
  assert.ok(text.startsWith('SC1.')); assert.ok(!text.includes('secret'));
  const want = P.readProfile();
  const r = S.parseSave('  ' + text.replace(/(.{40})/g, '$1\n') + ' ');
  assert.ok(r.ok); assert.ok(!('someone.else' in r.keys));
  fresh(); localStorage.setItem('someone.else', 'kept'); localStorage.setItem('club.v1.stale', 'x');
  assert.equal(S.importSave(localStorage, r.keys), Object.keys(r.keys).length);
  assert.deepEqual(P.readProfile(), want);
  assert.equal(localStorage.getItem('club.v1.chips'), '{"chips":1234}');
  assert.equal(localStorage.getItem('someone.else'), 'kept'); assert.equal(localStorage.getItem('club.v1.stale'), null);
});
ok(() => { // damaged, forged, oversized
  fresh(); P.ensureIdentity();
  const text = S.exportSave(localStorage);
  assert.equal(S.parseSave(text.slice(0, -12)).ok, false);
  assert.equal(S.parseSave(text.replace('SC1.', 'SC2.')).ok, false);
  const [m, b, c] = text.split('.');
  assert.equal(S.parseSave(`${m}.${b.slice(0, -2)}AA.${c}`).ok, false);
  assert.equal(S.parseSave('').ok, false); assert.equal(S.parseSave(null).ok, false); assert.equal(S.parseSave('x'.repeat(4e6)).ok, false);
  // a hand-built save with a foreign key is accepted but the key is dropped
  const body = Buffer.from(JSON.stringify({ v: 1, t: 1, keys: { 'evil.key': 'x', 'club.v1.chips': '1' } })).toString('base64url');
  let h = 0x811c9dc5; for (const ch of body) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const r = S.parseSave(`SC1.${body}.${h.toString(16).padStart(8, '0')}`);
  assert.ok(r.ok); assert.deepEqual(Object.keys(r.keys), ['club.v1.chips']);
});
ok(() => { fresh(); localStorage.setItem('club.v1.chips', '1'); localStorage.setItem('keep', '1'); assert.equal(S.resetSave(localStorage), 1); assert.equal(localStorage.getItem('keep'), '1'); });

console.log(`profile-check: ${n} groups passed`);
