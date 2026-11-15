// Synthesised sound: every effect is built from WebAudio oscillators and filtered
// noise, so the game ships no audio assets and makes no network request. The context
// is created lazily on the first user gesture (browsers block audio before that).
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(duration, filterType, frequency, gainValue, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone(type, from, to, duration, gainValue, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // One shot per weapon family: carbine cracks, DMR thumps, shotgun booms, pistol pops.
  function shot(kind) {
    if (!ensure()) return;
    if (kind === 'dmr') {
      noise(0.22, 'lowpass', 900, 0.9);
      tone('sine', 160, 55, 0.18, 0.7);
    } else if (kind === 'shotgun') {
      noise(0.32, 'lowpass', 650, 1.0);
      tone('sine', 120, 40, 0.28, 0.9);
    } else if (kind === 'sidearm') {
      noise(0.09, 'bandpass', 1800, 0.55);
      tone('square', 320, 140, 0.06, 0.18);
    } else {
      noise(0.11, 'bandpass', 1400, 0.7);
      tone('square', 240, 110, 0.07, 0.22);
    }
  }

  function reload() {
    if (!ensure()) return;
    tone('square', 900, 700, 0.04, 0.12);
    tone('square', 600, 500, 0.04, 0.12, 0.18);
    tone('square', 1100, 900, 0.05, 0.14, 0.42);
  }

  function dryFire() {
    if (!ensure()) return;
    tone('square', 700, 500, 0.03, 0.1);
  }

  function hit() {
    if (!ensure()) return;
    tone('sine', 1400, 1400, 0.05, 0.2);
  }

  function kill() {
    if (!ensure()) return;
    tone('sine', 880, 880, 0.07, 0.22);
    tone('sine', 1318, 1318, 0.1, 0.22, 0.07);
  }

  function hurt() {
    if (!ensure()) return;
    tone('sawtooth', 180, 90, 0.12, 0.18);
    noise(0.1, 'lowpass', 500, 0.25);
  }

  function step() {
    if (!ensure()) return;
    noise(0.05, 'lowpass', 420, 0.1);
  }

  function click() {
    if (!ensure()) return;
    tone('sine', 1200, 1200, 0.04, 0.15);
  }

  function buy() {
    if (!ensure()) return;
    tone('sine', 660, 660, 0.06, 0.18);
    tone('sine', 990, 990, 0.09, 0.18, 0.06);
  }

  function plantBeep(final) {
    if (!ensure()) return;
    tone('square', final ? 1500 : 1050, final ? 1500 : 1050, final ? 0.3 : 0.08, 0.16);
  }

  function explosion() {
    if (!ensure()) return;
    noise(1.4, 'lowpass', 320, 1.0);
    tone('sine', 90, 28, 1.1, 0.9);
    noise(0.5, 'highpass', 2500, 0.3);
  }

  function roundWin() {
    if (!ensure()) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => tone('sine', n, n, 0.16, 0.2, i * 0.11));
  }

  function roundLose() {
    if (!ensure()) return;
    const notes = [392, 330, 262, 196];
    notes.forEach((n, i) => tone('triangle', n, n, 0.18, 0.2, i * 0.12));
  }

  return { ensure, shot, reload, dryFire, hit, kill, hurt, step, click, buy, plantBeep, explosion, roundWin, roundLose };
}
