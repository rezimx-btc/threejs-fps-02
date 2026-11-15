// HUD: every DOM readout the player sees — health and armour, ammo, money,
// timer, score, kill feed, radio callouts, crosshair spread, hitmarker, damage
// flash and the direction the damage came from, plant/defuse progress, a
// compass strip, the minimap, and the menu / buy / pause / round / match
// overlays plus the Tab scoreboard. The game logic never touches the DOM; it
// calls these setters.
import { WEAPONS, GRENADE, ARMOR, HELMET } from './weapons.js';
import { CSS } from './palette.js';

export function createHud(mapData) {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthNum: $('health-num'),
    healthBar: $('health-fill'),
    armorNum: $('armor-num'),
    armorBar: $('armor-fill'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenadeCount: $('grenade-count'),
    money: $('money'),
    timer: $('timer'),
    roundLabel: $('round-label'),
    scoreA: $('score-a'),
    scoreB: $('score-b'),
    killfeed: $('killfeed'),
    callouts: $('callouts'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage-flash'),
    damageDir: $('damage-dir'),
    objective: $('objective'),
    compass: $('compass'),
    plantWrap: $('plant-wrap'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    minimap: $('minimap'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play-btn'),
    pause: $('pause-overlay'),
    resumeBtn: $('resume-btn'),
    buy: $('buy-overlay'),
    buyGrid: $('buy-grid'),
    buyPlan: $('buy-plan'),
    buyMoney: $('buy-money'),
    buyClose: $('buy-close'),
    round: $('round-overlay'),
    roundTitle: $('round-title'),
    roundSub: $('round-sub'),
    roundBoard: $('round-board'),
    match: $('match-overlay'),
    matchTitle: $('match-title'),
    matchSub: $('match-sub'),
    matchStats: $('match-stats'),
    againBtn: $('again-btn'),
    scoreboard: $('scoreboard'),
    scoreRows: $('score-rows'),
  };

  const mapCtx = el.minimap.getContext('2d');
  const MAP_W = 52;
  const MAP_H = 40;
  const SCALE = 3.1;
  const OX = 6;
  const OY = 6;

  function toMap(x, z) {
    return [OX + (x + MAP_W / 2) * SCALE, OY + (z + MAP_H / 2) * SCALE];
  }

  let lastFeedLength = 0;
  let lastCallout = '';
  let hitTimer = null;
  let dirTimer = null;

  function setHealth(hp, armor) {
    el.healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
    el.healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    el.healthBar.style.background = hp > 50 ? CSS.teamA : hp > 25 ? CSS.accent : CSS.danger;
    el.armorNum.textContent = armor > 0 ? String(Math.ceil(armor)) : '';
    el.armorBar.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    el.armorBar.parentElement.style.visibility = armor > 0 ? 'visible' : 'hidden';
  }

  function setAmmo(mag, reserve, reloading) {
    el.ammoMag.textContent = reloading ? '--' : String(mag);
    el.ammoReserve.textContent = `/ ${reserve}`;
    el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
  }

  function setWeapon(name, grenades) {
    el.weaponName.textContent = name;
    el.grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '';
  }

  function setMoney(amount) {
    el.money.textContent = `$${amount.toLocaleString('en-US')}`;
    el.buyMoney.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  function setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    el.timer.textContent = `${mm}:${ss}`;
    el.timer.style.color = s <= 10 ? CSS.danger : CSS.ink;
  }

  function setScore(winsA, winsB, round) {
    el.scoreA.textContent = String(winsA);
    el.scoreB.textContent = String(winsB);
    el.roundLabel.textContent = `ROUND ${round} / 9 — FIRST TO 5`;
  }

  function setObjective(text) {
    el.objective.textContent = text;
  }

  function setPlan(line) {
    if (el.buyPlan) el.buyPlan.textContent = line ? `ROUND PLAN — ${line}` : '';
  }

  function setCrosshair(spreadPx, aiming) {
    el.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    el.crosshair.classList.toggle('ads', !!aiming);
  }

  function hitMarker(killed, holdMs = 110) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', killed);
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), holdMs);
  }

  function damageFlash() {
    el.damage.classList.remove('on');
    void el.damage.offsetWidth;
    el.damage.classList.add('on');
  }

  // A red arc at the screen edge pointing at the shooter, so the player
  // knows which way to turn after taking a hit.
  function damageDirection(angleDeg) {
    el.damageDir.style.setProperty('--ang', `${angleDeg.toFixed(0)}deg`);
    el.damageDir.classList.add('on');
    if (dirTimer) clearTimeout(dirTimer);
    dirTimer = setTimeout(() => el.damageDir.classList.remove('on'), 600);
  }

  function setPlant(progress, label) {
    if (progress == null) {
      el.plantWrap.hidden = true;
      return;
    }
    el.plantWrap.hidden = false;
    el.plantFill.style.width = `${Math.round(progress * 100)}%`;
    el.plantLabel.textContent = label;
  }

  function renderFeed(feed) {
    if (feed.length === lastFeedLength) return;
    lastFeedLength = feed.length;
    el.killfeed.innerHTML = '';
    for (const entry of feed) {
      const div = document.createElement('div');
      div.className = 'feed-line';
      div.textContent = entry.text;
      div.style.color = entry.team === 'A' ? CSS.teamA : CSS.teamB;
      el.killfeed.appendChild(div);
    }
  }

  function renderCallouts(callouts) {
    if (!callouts.length || callouts[0].text === lastCallout) return;
    lastCallout = callouts[0].text;
    el.callouts.innerHTML = '';
    for (const entry of callouts) {
      const div = document.createElement('div');
      div.className = 'callout-line';
      div.textContent = `▸ ${entry.text}`;
      el.callouts.appendChild(div);
    }
  }

  // Compass: heading ticks plus the two site bearings, so the player always
  // knows which way the Depot and the Silos are without opening the map.
  function setCompass(yaw) {
    // yaw 0 faces north (-z). A bearing of 0 deg is north on the map.
    const heading = ((-yaw * 180) / Math.PI) % 360;
    const marks = [];
    const labels = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
    for (const [deg, label] of labels) {
      let rel = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(rel) < 70) marks.push(`<span style="left:${50 + rel * 0.7}%">${label}</span>`);
    }
    for (const [key, site] of Object.entries(mapData.sites)) {
      const bearing = (Math.atan2(site.cx, -site.cz) * 180) / Math.PI;
      let rel = ((bearing - heading + 540) % 360) - 180;
      if (Math.abs(rel) < 70) marks.push(`<b style="left:${50 + rel * 0.7}%">${key}</b>`);
    }
    el.compass.innerHTML = marks.join('');
  }

  // Minimap: walls, the two sites, teammates (teal), the player (white arrow),
  // the planted charge (blinking amber), and enemies only while they were seen
  // in the last 4 seconds (red, fading).
  function drawMinimap(playerPos, yaw, teammates, seenEnemies, time, plantedPos) {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, el.minimap.width, el.minimap.height);
    ctx.fillStyle = 'rgba(13,18,24,0.85)';
    ctx.fillRect(0, 0, el.minimap.width, el.minimap.height);
    ctx.fillStyle = '#3a4150';
    for (const wall of mapData.minimapWalls) {
      const [x, y] = toMap(wall.x, wall.z);
      ctx.fillRect(x, y, wall.w * SCALE, wall.d * SCALE);
    }
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const key of ['A', 'B']) {
      const site = mapData.sites[key];
      const [x, y] = toMap(site.cx, site.cz);
      ctx.fillStyle = 'rgba(255,176,46,0.9)';
      ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.fillStyle = '#0d1218';
      ctx.fillText(key, x, y + 4);
    }
    if (plantedPos) {
      const [x, y] = toMap(plantedPos.x, plantedPos.z);
      const blink = Math.sin(time * 6) > 0 ? 1 : 0.35;
      ctx.fillStyle = `rgba(255,176,46,${blink})`;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const mate of teammates) {
      const [x, y] = toMap(mate.x, mate.z);
      ctx.fillStyle = CSS.teamA;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const enemy of seenEnemies) {
      const age = time - enemy.at;
      if (age > 4) continue;
      const [x, y] = toMap(enemy.x, enemy.z);
      ctx.fillStyle = `rgba(255,90,60,${1 - age / 4})`;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const [px, py] = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function showOverlay(kind, data) {
    el.overlay.hidden = kind !== 'start' && kind !== 'end';
    el.pause.hidden = kind !== 'paused';
    el.buy.hidden = kind !== 'buy';
    el.round.hidden = kind !== 'round';
    el.match.hidden = kind !== 'match';
    if (kind === 'start') {
      el.overlayTitle.textContent = 'BREAKLINE';
      el.overlayCopy.textContent = 'Round-based tactical FPS. Plant the charge at the Depot or the Silos — or wipe the Vulture team. First to 5 rounds takes the match.';
      el.playBtn.textContent = 'Click to play';
    } else if (kind === 'end') {
      el.overlayTitle.textContent = 'Round over';
      el.overlayCopy.textContent = data || '';
      el.playBtn.textContent = 'Play again';
    }
    if (kind === 'round') {
      el.roundTitle.textContent = data.title;
      el.roundSub.textContent = data.sub;
      el.roundBoard.innerHTML = data.board || '';
    }
    if (kind === 'match') {
      el.matchTitle.textContent = data.title;
      el.matchSub.textContent = data.sub;
      el.matchStats.textContent = data.stats;
    }
  }

  function showScoreboard(open, rows) {
    el.scoreboard.hidden = !open;
    if (!open) return;
    el.scoreRows.innerHTML = '<h2>SCOREBOARD — HOLD TAB</h2>' + rows.map((r) => `<div class="score-row ${r.team}"><span>${r.name}</span><span>${r.kills}</span><span>${r.alive ? '●' : '✕'}</span></div>`).join('');
  }

  function buildBuyMenu(onBuy, onClose) {
    el.buyGrid.innerHTML = '';
    const cards = [];
    function addCard(id, def, priceText) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-card';
      card.innerHTML = `<b>${def.name}</b><span>${def.desc}</span><em>${priceText}</em>`;
      card.addEventListener('click', () => onBuy(id));
      el.buyGrid.appendChild(card);
      cards.push({ id, card });
    }
    for (const def of Object.values(WEAPONS)) addCard(def.id, def, def.price === 0 ? 'FREE' : `$${def.price.toLocaleString('en-US')}`);
    addCard('grenade', GRENADE, `$${GRENADE.price} · max ${GRENADE.maxCarry}`);
    addCard('armor', ARMOR, `$${ARMOR.price} · ${ARMOR.points} plates`);
    addCard('helmet', HELMET, `$${HELMET.price} · half headshot dmg`);
    el.buyClose.addEventListener('click', onClose);
    return {
      refresh(owned, money, armor, hasHelmet, grenades) {
        for (const { id, card } of cards) {
          const def = WEAPONS[id] || (id === 'grenade' ? GRENADE : id === 'armor' ? ARMOR : HELMET);
          let isOwned = false;
          let label = '';
          if (WEAPONS[id]) {
            isOwned = owned.includes(id);
            label = isOwned ? 'OWNED' : def.price === 0 ? 'FREE' : `$${def.price.toLocaleString('en-US')}`;
          } else if (id === 'grenade') {
            isOwned = grenades >= GRENADE.maxCarry;
            label = isOwned ? `MAX (${grenades})` : `$${GRENADE.price} · have ${grenades}`;
          } else if (id === 'armor') {
            isOwned = armor >= ARMOR.points;
            label = isOwned ? 'EQUIPPED' : `$${ARMOR.price} · ${ARMOR.points} plates`;
          } else {
            isOwned = hasHelmet;
            label = isOwned ? 'OWNED' : `$${HELMET.price} · half headshot dmg`;
          }
          card.classList.toggle('owned', isOwned);
          card.querySelector('em').textContent = label;
          card.classList.toggle('poor', !isOwned && money < def.price);
        }
      },
    };
  }

  return {
    setHealth,
    setAmmo,
    setWeapon,
    setMoney,
    setTimer,
    setScore,
    setObjective,
    setPlan,
    setCrosshair,
    hitMarker,
    damageFlash,
    damageDirection,
    setPlant,
    renderFeed,
    renderCallouts,
    setCompass,
    drawMinimap,
    showOverlay,
    showScoreboard,
    buildBuyMenu,
    onPlay(callback) { el.playBtn.addEventListener('click', callback); },
    onResume(callback) { el.resumeBtn.addEventListener('click', callback); },
    onAgain(callback) { el.againBtn.addEventListener('click', callback); },
  };
}
