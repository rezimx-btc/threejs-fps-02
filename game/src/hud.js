// HUD: every DOM readout the player sees — health, ammo, money, timer, score,
// kill feed, crosshair spread, hitmarker, damage flash, plant progress, the
// minimap, and the menu / buy / pause / round / match overlays. The game logic
// never touches the DOM; it calls these setters.
import { WEAPONS, GRENADE } from './weapons.js';
import { CSS } from './palette.js';

export function createHud(mapData) {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthNum: $('health-num'),
    healthBar: $('health-fill'),
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
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage-flash'),
    objective: $('objective'),
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
    buyMoney: $('buy-money'),
    buyClose: $('buy-close'),
    round: $('round-overlay'),
    roundTitle: $('round-title'),
    roundSub: $('round-sub'),
    match: $('match-overlay'),
    matchTitle: $('match-title'),
    matchSub: $('match-sub'),
    matchStats: $('match-stats'),
    againBtn: $('again-btn'),
  };

  const mapCtx = el.minimap.getContext('2d');
  const MAP_W = 46;
  const MAP_H = 36;
  const SCALE = 3.4;
  const OX = 6;
  const OY = 6;

  function toMap(x, z) {
    return [OX + (x + MAP_W / 2) * SCALE, OY + (z + MAP_H / 2) * SCALE];
  }

  let lastFeedLength = 0;
  let hitTimer = null;

  function setHealth(hp) {
    el.healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
    el.healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    el.healthBar.style.background = hp > 50 ? CSS.teamA : hp > 25 ? CSS.accent : CSS.danger;
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

  function setCrosshair(spreadPx) {
    el.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
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

  // Minimap: walls, the two sites, teammates (teal), the player (white arrow),
  // and enemies only while they were seen in the last 4 seconds (red, fading).
  function drawMinimap(playerPos, yaw, teammates, seenEnemies, time) {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, el.minimap.width, el.minimap.height);
    ctx.fillStyle = 'rgba(20,22,26,0.82)';
    ctx.fillRect(0, 0, el.minimap.width, el.minimap.height);
    ctx.fillStyle = '#3a3f47';
    for (const wall of mapData.minimapWalls) {
      const [x, y] = toMap(wall.x, wall.z);
      ctx.fillRect(x, y, wall.w * SCALE, wall.d * SCALE);
    }
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const key of ['A', 'B']) {
      const site = mapData.sites[key];
      const [x, y] = toMap(site.cx, site.cz);
      ctx.fillStyle = 'rgba(240,168,48,0.9)';
      ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.fillStyle = '#171a20';
      ctx.fillText(key, x, y + 4);
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
      ctx.fillStyle = `rgba(228,87,46,${1 - age / 4})`;
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
      el.overlayTitle.textContent = 'SANDLINE';
      el.overlayCopy.textContent = 'Round-based tactical FPS. Plant the charge at Foundry or the Crane Yard — or wipe the Ember team. First to 5 rounds takes the match.';
      el.playBtn.textContent = 'Click to play';
    } else if (kind === 'end') {
      el.overlayTitle.textContent = 'Round over';
      el.overlayCopy.textContent = data || '';
      el.playBtn.textContent = 'Play again';
    }
    if (kind === 'round') {
      el.roundTitle.textContent = data.title;
      el.roundSub.textContent = data.sub;
    }
    if (kind === 'match') {
      el.matchTitle.textContent = data.title;
      el.matchSub.textContent = data.sub;
      el.matchStats.textContent = data.stats;
    }
  }

  function buildBuyMenu(onBuy, onClose) {
    el.buyGrid.innerHTML = '';
    const cards = [];
    for (const def of Object.values(WEAPONS)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-card';
      card.innerHTML = `<b>${def.name}</b><span>${def.desc}</span><em>${def.price === 0 ? 'FREE' : '$' + def.price.toLocaleString('en-US')}</em>`;
      card.addEventListener('click', () => onBuy(def.id));
      el.buyGrid.appendChild(card);
      cards.push({ id: def.id, card });
    }
    const grenadeCard = document.createElement('button');
    grenadeCard.type = 'button';
    grenadeCard.className = 'buy-card';
    grenadeCard.innerHTML = `<b>${GRENADE.name}</b><span>${GRENADE.desc}</span><em>$${GRENADE.price} · max ${GRENADE.maxCarry}</em>`;
    grenadeCard.addEventListener('click', () => onBuy('grenade'));
    el.buyGrid.appendChild(grenadeCard);
    cards.push({ id: 'grenade', card: grenadeCard });
    el.buyClose.addEventListener('click', onClose);
    return {
      refresh(owned, money) {
        for (const { id, card } of cards) {
          const isOwned = owned.includes(id);
          card.classList.toggle('owned', isOwned);
          const def = WEAPONS[id] || GRENADE;
          card.querySelector('em').textContent = isOwned
            ? 'OWNED'
            : def.price === 0
              ? 'FREE'
              : `$${def.price.toLocaleString('en-US')}`;
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
    setCrosshair,
    hitMarker,
    damageFlash,
    setPlant,
    renderFeed,
    drawMinimap,
    showOverlay,
    buildBuyMenu,
    onPlay(callback) { el.playBtn.addEventListener('click', callback); },
    onResume(callback) { el.resumeBtn.addEventListener('click', callback); },
    onAgain(callback) { el.againBtn.addEventListener('click', callback); },
  };
}
