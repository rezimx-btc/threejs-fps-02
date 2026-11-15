// Match state: one object owns the whole match — phase, rounds, money, loadout,
// armour, the defuse kit, per-fighter kills and the kill feed — so the loop in
// main.js only ever reads it and asks it to move. First to 5 rounds takes the
// match (9 rounds max). Kestrel attacks every round: plant the charge at the
// Depot or the Silos, or wipe the Vulture team. Defenders can defuse a planted
// charge; buy a kit and it takes half the time.
// The round plan is the IGL's call for the round: which site the squad hits,
// which lane the lurker fakes, and the line the HUD shows the player.
import { WEAPONS, GRENADE, ARMOR, HELMET, makeWeaponState } from './weapons.js';

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const BUY_SECONDS = 20;
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
    armor: 0,
    hasHelmet: false,
    hasCharge: true,
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    feed: [], // {text, team, at}
    callouts: [], // {text, at} — radio lines from the squad, newest first
    plan: null, // {site, fake, line}
    roundEndAt: 0,
    matchWinner: null,
    lastRoundReason: '',
    weapons: { sidearm: makeWeaponState('sidearm') },
    killsBy: {}, // name -> kills this match
  };

  function resetMatch() {
    match.round = 1;
    match.winsA = 0;
    match.winsB = 0;
    match.money = START_MONEY;
    match.owned = ['sidearm'];
    match.current = 'sidearm';
    match.grenades = 0;
    match.armor = 0;
    match.hasHelmet = false;
    match.hasCharge = true;
    match.kills = 0;
    match.deaths = 0;
    match.shotsFired = 0;
    match.shotsHit = 0;
    match.feed = [];
    match.callouts = [];
    match.plan = null;
    match.matchWinner = null;
    match.killsBy = {};
    match.weapons = { sidearm: makeWeaponState('sidearm') };
  }

  function startRound() {
    match.phase = PHASE.BUY;
    match.timer = BUY_SECONDS;
    match.hasCharge = true;
    // Fresh ammo every round; bought guns and gear stay bought.
    for (const id of match.owned) {
      const def = WEAPONS[id];
      const state = match.weapons[id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.reloading = 0;
      state.shotsFired = 0;
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

  function addCallout(text) {
    match.callouts.unshift({ text, at: performance.now() });
    if (match.callouts.length > 3) match.callouts.length = 3;
  }

  function awardKill(killerName) {
    match.money += 300;
    match.kills += 1;
    if (killerName) match.killsBy[killerName] = (match.killsBy[killerName] || 0) + 1;
  }

  function recordBotKill(name) {
    match.killsBy[name] = (match.killsBy[name] || 0) + 1;
  }

  function buy(id) {
    if (id === 'grenade') {
      if (match.grenades >= GRENADE.maxCarry) return 'maxed';
      if (match.money < GRENADE.price) return 'poor';
      match.money -= GRENADE.price;
      match.grenades += 1;
      return 'ok';
    }
    if (id === 'armor') {
      if (match.armor >= ARMOR.points) return 'maxed';
      if (match.money < ARMOR.price) return 'poor';
      match.money -= ARMOR.price;
      match.armor = ARMOR.points;
      return 'ok';
    }
    if (id === 'helmet') {
      if (match.hasHelmet) return 'owned';
      if (match.money < HELMET.price) return 'poor';
      match.money -= HELMET.price;
      match.hasHelmet = true;
      return 'ok';
    }
    const def = WEAPONS[id];
    if (!def) return 'unknown';
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

  function mvp() {
    let best = null;
    let bestKills = -1;
    for (const [name, kills] of Object.entries(match.killsBy)) {
      if (kills > bestKills) { bestKills = kills; best = name; }
    }
    return best ? { name: best, kills: bestKills } : null;
  }

  // Attach the operations to the match object itself (not a spread copy), so
  // callers reading match.phase see every transition the methods make.
  Object.assign(match, {
    resetMatch, startRound, beginLive, addFeed, addCallout, awardKill, recordBotKill,
    buy, selectWeapon, endRound, nextRound, mvp,
  });
  return match;
}
