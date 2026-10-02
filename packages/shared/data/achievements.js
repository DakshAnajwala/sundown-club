/**
 * Achievement definitions (data). Adding one is adding a line; the schema is
 * checked by tools/content-check.mjs. Spec: docs/retention/SPEC-content.md §2.
 *
 * Rule kinds, exactly one per entry:
 *   stat:  a lifetime counter (progression.js lists them)   { stat: 'bj.wins', gte: 25 }
 *   on:    one finished round, same matching as daily quests { on: 'holdem:hand', where: {...}, gte: {...} }
 *   hour:  a round played in these local hours              { hour: [0, 1, 2, 3] }
 * `hidden` ones show as "Hidden" in the collection until found. `reward.item`
 * gives a cosmetic. XP by rarity is in progression.js (25 / 60 / 150 / 400).
 */
const A = [];
const add = (id, name, text, rarity, rule, extra = {}) => A.push({ id, name, text, rarity, ...rule, ...extra });
const ladder = (prefix, stat, label, tiers) => tiers.forEach(([n, name, rarity, extra]) => add(`${prefix}.${n}`, name, `${label.replace('#', n.toLocaleString('en-US'))}`, rarity, { stat, gte: n }, extra || {}));

// ------------------------------------------------------------------ Blackjack
ladder('bj.hands', 'bj.hands', 'Play # hands of Blackjack', [[10, 'Warming the seat', 'common'], [50, 'Regular at the felt', 'common'], [250, 'Shoe after shoe', 'uncommon'], [1000, 'Thousand-hand night', 'rare'], [5000, 'The dealer knows your name', 'epic']]);
ladder('bj.wins', 'bj.wins', 'Win # hands of Blackjack', [[5, 'First stack of chips', 'common'], [25, 'Ahead of the house', 'common'], [100, 'Hot streak, cold hands', 'uncommon'], [500, 'The long game', 'rare']]);
ladder('bj.naturals', 'bj.naturals', 'Be dealt # Blackjacks', [[1, 'Ace and a ten', 'common'], [5, 'Lucky pair', 'uncommon'], [25, 'Suspiciously often', 'rare']]);
add('bj.double', 'Double or nothing', 'Double down and win', 'common', { on: 'blackjack:hand', where: { doubled: [true], result: ['win'] } });
ladder('bj.doubles', 'bj.doubleWins', 'Win # hands after doubling down', [[10, 'Nerves of felt', 'uncommon']]);
add('bj.five', 'Five-card charlie', 'Win a hand with five cards or more', 'uncommon', { on: 'blackjack:hand', where: { result: ['win', 'natural'] }, gte: { cards: 5 } });
add('bj.21', 'Twenty-one exactly', 'Finish a hand on 21 without a Blackjack', 'common', { on: 'blackjack:hand', where: { bust: [false] }, gte: { total: 21, cards: 3 } });
ladder('bj.busts', 'bj.busts', 'Bust # times', [[10, 'Too greedy', 'common', { hidden: true }], [50, 'Gravity always wins', 'uncommon', { hidden: true }]]);
ladder('bj.streak', 'bj.bestStreak', 'Win # hands in a row', [[3, 'Three in a row', 'common'], [6, 'Six in a row', 'rare'], [10, 'Ten in a row', 'epic', { hidden: true }]]);
ladder('bj.chips', 'bj.chipsWon', 'Win # chips in total at Blackjack', [[1000, 'A grand of play money', 'common'], [10000, 'Ten grand of play money', 'uncommon'], [100000, 'A bank of play money', 'rare']]);
add('bj.bignet', 'Big hand', 'Win 1,000 chips or more on one hand', 'rare', { on: 'blackjack:hand', where: { result: ['win', 'natural'] }, gte: { net: 1000 } });

// ------------------------------------------------------------------ Hold'em
ladder('hd.hands', 'hd.hands', "Play # hands of Hold'em", [[10, 'Pulled up a chair', 'common'], [50, 'Know the regulars', 'common'], [250, 'Blinds in your sleep', 'uncommon'], [1000, 'Table of regulars', 'rare']]);
ladder('hd.wins', 'hd.wins', "Win # pots at Hold'em", [[3, 'First pots', 'common'], [25, 'Pot collector', 'common'], [100, 'Stacking chips', 'uncommon'], [400, 'The big stack', 'rare']]);
add('hd.nofold', 'Everyone folded', 'Win a pot when everyone else folds', 'common', { on: 'holdem:hand', where: { won: [true], showdown: [false] } });
ladder('hd.nofolds', 'hd.noFoldWins', 'Win # pots without a showdown', [[10, 'Quiet confidence', 'uncommon'], [50, 'The staredown', 'rare']]);
add('hd.straight', 'Straight to the point', 'Win a showdown with a straight or better', 'uncommon', { on: 'holdem:hand', where: { won: [true], showdown: [true] }, gte: { cat: 4 } });
add('hd.flush', 'Flush with success', 'Win a showdown with a flush or better', 'uncommon', { on: 'holdem:hand', where: { won: [true], showdown: [true] }, gte: { cat: 5 } });
add('hd.house', 'Full house', 'Win a showdown with a full house or better', 'rare', { on: 'holdem:hand', where: { won: [true], showdown: [true] }, gte: { cat: 6 } });
add('hd.quads', 'Four of a kind', 'Win a showdown with four of a kind or better', 'epic', { on: 'holdem:hand', where: { won: [true], showdown: [true] }, gte: { cat: 7 } }, { hidden: true });
add('hd.pot500', 'Half a grand pot', 'Win a pot of 500 or more', 'uncommon', { on: 'holdem:hand', where: { won: [true] }, gte: { pot: 500 } });
add('hd.pot2000', 'A pot to remember', 'Win a pot of 2,000 or more', 'rare', { on: 'holdem:hand', where: { won: [true] }, gte: { pot: 2000 } });
ladder('hd.folds', 'hd.folds', 'Fold # hands', [[25, 'Patience', 'common', { hidden: true }], [250, 'Discipline', 'uncommon', { hidden: true }]]);
ladder('hd.showdowns', 'hd.showdownWins', 'Win # showdowns', [[10, 'Cards on the table', 'common'], [100, 'Reads the river', 'rare']]);

// ------------------------------------------------------------------ Video Poker
ladder('vp.hands', 'vp.hands', 'Play # hands of Video Poker', [[10, 'Pull the lever', 'common'], [50, 'Hold and hope', 'common'], [250, 'Full-pay regular', 'uncommon'], [1000, 'Machine whisperer', 'rare']]);
ladder('vp.wins', 'vp.wins', 'Hit # winning hands', [[5, 'Something back', 'common'], [50, 'Paying its way', 'uncommon'], [250, 'Better than average', 'rare']]);
add('vp.twopair', 'Two of a kind, twice', 'Hit two pair or better', 'common', { on: 'videopoker:hand', gte: { rank: 2 }, where: { win: [true] } });
add('vp.trips', 'Three of a kind', 'Hit three of a kind or better', 'common', { on: 'videopoker:hand', gte: { rank: 3 }, where: { win: [true] } });
add('vp.straight', 'Straight', 'Hit a straight or better', 'uncommon', { on: 'videopoker:hand', gte: { rank: 4 }, where: { win: [true] } });
add('vp.flush', 'Flush', 'Hit a flush or better', 'uncommon', { on: 'videopoker:hand', gte: { rank: 5 }, where: { win: [true] } });
add('vp.house', 'Full house', 'Hit a full house or better', 'rare', { on: 'videopoker:hand', gte: { rank: 6 }, where: { win: [true] } });
add('vp.quads', 'Four of a kind', 'Hit four of a kind or better', 'rare', { on: 'videopoker:hand', gte: { rank: 7 }, where: { win: [true] } });
add('vp.sf', 'Straight flush', 'Hit a straight flush or better', 'epic', { on: 'videopoker:hand', gte: { rank: 8 }, where: { win: [true] } }, { hidden: true });
add('vp.royal', 'Royal flush', 'Hit a royal flush', 'epic', { on: 'videopoker:hand', gte: { rank: 9 }, where: { win: [true] } }, { hidden: true, reward: { item: 'cardback.ink' } });
ladder('vp.maxbet', 'vp.maxBets', 'Play # hands at max bet', [[25, 'All five coins', 'common'], [250, 'Never short-stacked', 'uncommon']]);
ladder('vp.chips', 'vp.chipsWon', 'Win # chips in total at Video Poker', [[500, 'Coins in the tray', 'common'], [5000, 'A hopper full', 'uncommon'], [50000, 'The jackpot fund', 'rare']]);

// ------------------------------------------------------------------ Parking
ladder('pk.parks', 'pk.parks', 'Finish # parks', [[1, 'In the bay', 'common'], [5, 'Settling in', 'common'], [25, 'Valet in training', 'uncommon'], [100, 'A hundred bays', 'rare'], [500, 'Parked everywhere', 'epic']]);
ladder('pk.stars', 'pk.stars', 'Earn # stars while parking', [[10, 'Ten stars', 'common'], [50, 'Fifty stars', 'uncommon'], [200, 'Two hundred stars', 'rare']]);
ladder('pk.three', 'pk.threeStars', 'Earn three stars on # parks', [[1, 'Three-star park', 'common'], [10, 'Ten perfect-ish', 'uncommon'], [50, 'Consistently tidy', 'rare']]);
ladder('pk.perfect', 'pk.perfect', 'Score 98 or more on # parks', [[1, 'Nearly perfect', 'uncommon'], [10, 'Between the lines', 'rare', { reward: { item: 'badge.valet' } }]]);
ladder('pk.clean', 'pk.clean', 'Finish # parks without touching anything', [[5, 'Light touch', 'common'], [25, 'Not a scratch', 'uncommon'], [100, 'Untouchable', 'rare']]);
ladder('pk.par', 'pk.underPar', 'Finish # parks inside par time', [[5, 'On the clock', 'common'], [25, 'Ahead of the clock', 'uncommon']]);
add('pk.score90', 'Ninety plus', 'Score 90 or more on a park', 'common', { on: 'parking:park', gte: { score: 90 } });
add('pk.fast3', 'Quick and clean', 'Finish a three-star park inside par time', 'rare', { on: 'parking:park', where: { underPar: [true], clean: [true] }, gte: { stars: 3 } });

// ------------------------------------------------------------------ Night Drive
ladder('rc.runs', 'rc.runs', 'Make # runs in the Night Drive test drive', [[1, 'Key in the ignition', 'common'], [10, 'Warm tyres', 'common'], [50, 'Test driver', 'uncommon']]);
ladder('rc.speed', 'rc.topKmh', 'Reach # km/h', [[100, 'Triple digits', 'common'], [150, 'One-fifty', 'uncommon'], [190, 'Past one-ninety', 'rare'], [230, 'Flat out', 'epic', { hidden: true }]]);
ladder('rc.drift', 'rc.drift', 'Hold a drift for # seconds', [[3, 'Sideways', 'common'], [8, 'Long slide', 'uncommon'], [15, 'Held it', 'rare'], [30, 'Never straightened', 'epic', { hidden: true, reward: { item: 'badge.heel-toe' } }]]);

// ------------------------------------------------------------------ The club
ladder('club.level', 'level', 'Reach club level #', [[5, 'Level 5', 'common'], [10, 'Level 10', 'common'], [25, 'Level 25', 'uncommon'], [50, 'Level 50', 'rare'], [75, 'Level 75', 'epic'], [100, 'Keeper of the Lamp', 'epic', { reward: { item: 'badge.lamp' } }]]);
ladder('club.streak', 'streak.best', 'Play # days in a row', [[3, 'Three evenings', 'common'], [7, 'A week of evenings', 'uncommon'], [14, 'Fortnight', 'uncommon'], [30, 'A month of evenings', 'rare', { reward: { item: 'badge.streaker' } }], [60, 'Two months', 'epic'], [100, 'A hundred evenings', 'epic']]);
ladder('club.weeks', 'weekly.best', 'Play on four days a week, # weeks running', [[2, 'Two good weeks', 'common'], [4, 'A good month', 'uncommon'], [12, 'A good season', 'rare']]);
ladder('club.claims', 'daily.claims', 'Claim the daily reward # times', [[1, 'First claim', 'common'], [7, 'Seven claims', 'common'], [30, 'Thirty claims', 'uncommon'], [100, 'A hundred claims', 'rare']]);
ladder('club.quests', 'quests.done', 'Finish # daily quests', [[1, 'First quest', 'common'], [10, 'Ten quests', 'common'], [50, 'Fifty quests', 'uncommon'], [250, 'Quest regular', 'rare'], [1000, 'Quest machine', 'epic']]);
ladder('club.clear', 'allclears', "Clear all three of a night's quests # times", [[1, 'Cleared the table', 'common'], [7, 'Seven clean sweeps', 'uncommon'], [30, 'Thirty clean sweeps', 'rare']]);
ladder('club.seed', 'seeds.done', 'Play # Daily Seed challenges', [[1, 'Same deal as everyone', 'common'], [7, 'Seven daily seeds', 'uncommon'], [30, 'Thirty daily seeds', 'rare']]);
ladder('club.rounds', 'rounds', 'Finish # rounds in any game', [[25, 'Getting going', 'common'], [250, 'Settled in', 'common'], [1000, 'Part of the furniture', 'uncommon'], [5000, 'Lifelong member', 'rare']]);
ladder('club.share', 'shares', 'Share # results', [[1, 'Show and tell', 'common'], [10, 'Word of mouth', 'uncommon']]);
add('club.games2', 'Both sides of the club', 'Play both a card game and a driving game', 'common', { stat: 'families.seen', gte: 2 });
add('club.games5', 'Every game in the house', 'Play all five games', 'rare', { stat: 'games.seen', gte: 5 }, { reward: { item: 'badge.card-room' } });
add('club.day3', 'Three games, one night', 'Play three different games in one day', 'uncommon', { stat: 'day.games', gte: 3 });
add('club.first', 'First win', 'Win your first round of anything', 'common', { stat: 'wins.any', gte: 1 });
add('club.welcome', 'Welcome table', 'Finish the welcome table', 'common', { stat: 'welcomed', gte: 1 });
add('club.owl', 'After midnight', 'Finish a round between midnight and 4 a.m.', 'uncommon', { hour: [0, 1, 2, 3] }, { hidden: true, reward: { item: 'badge.night-owl' } });
add('club.lark', 'Up with the lark', 'Finish a round between 5 and 7 a.m.', 'uncommon', { hour: [5, 6] }, { hidden: true, reward: { item: 'badge.early-bird' } });
add('club.friend', 'Good company', 'Bring a friend: they finish a first round from your link', 'uncommon', { stat: 'invites', gte: 1 }, { reward: { item: 'badge.friend' } });
add('club.club', 'A club of your own', 'Make or join a friends club', 'common', { stat: 'club.joined', gte: 1 });
add('club.season', 'Season finisher', 'Reach the last tier of a season', 'rare', { stat: 'seasons.done', gte: 1 });
add('club.items', 'Starting a collection', 'Own 10 collectables', 'common', { stat: 'items.owned', gte: 10 });
add('club.items25', 'A proper collection', 'Own 25 collectables', 'uncommon', { stat: 'items.owned', gte: 25 });
add('club.mastery', 'Mastery', 'Reach mastery level 10 in any game', 'uncommon', { stat: 'mastery.best', gte: 10 });
add('club.mastery20', 'Master of one', 'Reach mastery level 20 in any game', 'epic', { stat: 'mastery.best', gte: 20 });
add('club.weekly', 'Weekly goal', 'Finish a weekly goal', 'common', { stat: 'weekly.done', gte: 1 });
add('club.weekly10', 'Ten weekly goals', 'Finish 10 weekly goals', 'rare', { stat: 'weekly.done', gte: 10 });

export const ACHIEVEMENTS = A;
export const ACHIEVEMENT_BY_ID = Object.fromEntries(A.map((a) => [a.id, a]));
