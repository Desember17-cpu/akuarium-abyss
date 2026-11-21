// Suara synth WebAudio — tanpa file audio eksternal.
// Langkah (gelembung), ambil mutiara (denting), sting alert, ambient bawah laut.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let ambientNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted || !ctx || ctx.state === 'suspended') return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio tidak boleh mematikan game.
    }
  }

  function startAmbient() {
    if (!ensure() || ambientNodes || muted) return;
    try {
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 55.7;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(g);
      g.connect(master);
      osc1.start();
      osc2.start();
      lfo.start();
      ambientNodes = { osc1, osc2, lfo, g };
    } catch {
      ambientNodes = null;
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      startAmbient();
    },
    setMuted(v) {
      muted = v;
      if (master) master.gain.value = v ? 0 : 0.5;
    },
    step(sneak) {
      tone(sneak ? 300 : 220, 0.09, 'sine', sneak ? 0.05 : 0.09, 420);
    },
    pickup() {
      tone(880, 0.16, 'sine', 0.22, 1320);
      setTimeout(() => tone(1320, 0.22, 'sine', 0.18, 1760), 70);
    },
    alert() {
      tone(196, 0.28, 'sawtooth', 0.16, 147);
      setTimeout(() => tone(147, 0.3, 'sawtooth', 0.16, 98), 140);
    },
    suspicious() {
      tone(520, 0.14, 'triangle', 0.12, 660);
    },
    feed() {
      tone(600, 0.1, 'sine', 0.12, 900);
      setTimeout(() => tone(900, 0.12, 'sine', 0.1, 1200), 60);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.32, 'sine', 0.2), i * 130));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.16), i * 150));
    },
  };
}
