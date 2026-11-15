// Match state: one object owns the whole match — phase, rounds, money, loadout
// and the kill feed — so the loop in main.js only ever reads and asks it to move.
// First to 5 rounds takes the match (9 rounds max). The player attacks every
// round: plant the charge at Foundry or the Crane Yard, or wipe the Ember team.
import { WEAPONS, GRENADE, makeWeaponState } from './weapons.js';

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;

export function createMatch() {
  const match = {
    phase: PHASE.MENU,
    round: 1,
    winsA: 0,
    winsB: 0,
    money: START_MONEY,
    timer: 0,
    owned: ['sidearm'],
    current: 'sidearm',
    grenades: 0,
    hasCharge: true,
    kills: 0,
    deaths: 0,
    feed: [], // {text, team, time}
    roundEndAt: 0,
    matchWinner: null,
    lastRoundReason: '',
    weapons: { sidearm: makeWeaponState('sidearm') },
  };

  function resetMatch() {
    match.round = 1;
    match.winsA = 0;
    match.winsB = 0;
    match.money = START_MONEY;
    match.owned = ['sidearm'];
    match.current = 'sidearm';
    match.grenades = 0;
    match.hasCharge = true;
    match.kills = 0;
    match.deaths = 0;
    match.feed = [];
    match.matchWinner = null;
    match.weapons = { sidearm: makeWeaponState('sidearm') };
  }

  function startRound() {
    match.phase = PHASE.BUY;
    match.timer = BUY_SECONDS;
    match.hasCharge = true;
    // Fresh ammo every round; bought guns stay bought.
    for (const id of match.owned) {
      const def = WEAPONS[id];
      const state = match.weapons[id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.reloading = 0;
    }
  }

  function beginLive() {
    match.phase = PHASE.LIVE;
    match.timer = ROUND_SECONDS;
  }

  function addFeed(text, team) {
    match.feed.unshift({ text, team, at: performance.now() });
    if (match.feed.length > 5) match.feed.length = 5;
  }

  function awardKill() {
    match.money += 300;
    match.kills += 1;
  }

  function buy(id) {
    const def = WEAPONS[id] || (id === 'grenade' ? GRENADE : null);
    if (!def) return 'unknown';
    if (id === 'grenade') {
      if (match.grenades >= GRENADE.maxCarry) return 'maxed';
      if (match.money < GRENADE.price) return 'poor';
      match.money -= GRENADE.price;
      match.grenades += 1;
      return 'ok';
    }
    if (match.owned.includes(id)) return 'owned';
    if (match.money < def.price) return 'poor';
    match.money -= def.price;
    match.owned.push(id);
    match.weapons[id] = makeWeaponState(id);
    match.current = id;
    return 'ok';
  }

  function selectWeapon(id) {
    if (match.owned.includes(id) && match.weapons[id]) match.current = id;
  }

  // Close a round: award money, record the win, decide whether the match ends.
  function endRound(winner, reason) {
    match.lastRoundReason = reason;
    if (winner === 'A') {
      match.winsA += 1;
      match.money += 3250;
    } else {
      match.winsB += 1;
      match.money += 1900;
    }
    match.phase = PHASE.ROUND_END;
    match.roundEndAt = performance.now();
    if (match.winsA >= WIN_ROUNDS || match.winsB >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.phase = PHASE.MATCH_END;
      match.matchWinner = match.winsA > match.winsB ? 'A' : match.winsB > match.winsA ? 'B' : 'draw';
    }
  }

  function nextRound() {
    match.round += 1;
    startRound();
  }

  // Attach the operations to the match object itself (not a spread copy), so
  // callers reading match.phase see every transition the methods make.
  Object.assign(match, { resetMatch, startRound, beginLive, addFeed, awardKill, buy, selectWeapon, endRound, nextRound });
  return match;
}
