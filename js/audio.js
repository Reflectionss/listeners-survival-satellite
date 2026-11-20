/* Procedural sound (WebAudio, no files): drone, sonar pings, data chatter, effects.
   Starts after the first user gesture. */
(function () {
  let ctx = null, master = null, fx = null, noiseBuf = null;
  let on = true;
  let mode = 'idle';
  let loopTimer = null;
  let beatN = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);

  function env(g, t, a, d, vol) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // wet = send level into echo bus
  function tone(freq, t, dur, vol = 0.5, type = 'sine', wet = 0, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    env(g, t, 0.006, dur, vol);
    o.connect(g);
    g.connect(dest || master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(fx);
    }
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  function noise(t, dur, vol, f0, f1, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    env(g, t, Math.min(0.03, dur / 3), dur, vol);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);

    // echo bus (sonar tail)
    fx = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    fx.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // low drone
    const dg = ctx.createGain();
    dg.gain.value = 0.16;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 260;
    lpf.Q.value = 4;
    [55, 55.4, 82.4].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.5 : 0.35;
      o.connect(g).connect(lpf);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(lpf.frequency);
    lfo.start();
    lpf.connect(dg).connect(master);
  }

  // ---- rhythmic layer ----
  function ping(t) {
    tone(1040, t, 0.14, 0.55, 'sine', 0.55);
    tone(2080, t, 0.05, 0.12, 'sine');
  }
  function schedule() {
    clearTimeout(loopTimer);
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    beatN++;
    let next = 2200;
    if (on) {
      if (mode === 'idle') {
        // "beep ... beep ... beep-beep"
        if (beatN % 4 === 0) {
          tone(780, t, 0.1, 0.5, 'sine', 0.4);
          tone(780, t + 0.2, 0.1, 0.5, 'sine', 0.4);
          next = 2600;
        } else ping(t);
        if (beatN % 3 === 0) noise(t + 1.0, 0.18, 0.05, 3000, 6000, 3);
      } else if (mode === 'uplink') {
        // fast data chatter
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tone(rnd(1100, 2800), t + i * 0.055, 0.04, 0.22, 'square');
        if (beatN % 4 === 0) ping(t + 0.3);
        next = rnd(280, 520);
      } else if (mode === 'zones') {
        if (beatN % 3 === 0) ping(t);
        else tone(rnd(1500, 2200), t, 0.05, 0.16, 'sine', 0.3);
        next = 1700;
      }
    }
    loopTimer = setTimeout(schedule, next);
  }

  const SFX = {
    start() {
      if (ctx) return ctx.resume();
      try { buildGraph(); } catch (e) { ctx = null; return; }
      schedule();
    },
    mode(m) {
      mode = m;
      if (ctx) schedule();
    },
    ok() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      tone(660, t, 0.12, 0.55, 'triangle', 0.3);
      tone(990, t + 0.12, 0.12, 0.55, 'triangle', 0.3);
      tone(1320, t + 0.24, 0.3, 0.55, 'triangle', 0.5);
    },
    deny() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      tone(150, t, 0.25, 0.7, 'square');
      tone(150, t + 0.32, 0.25, 0.7, 'square');
      noise(t, 0.35, 0.18, 800, 200);
    },
    key() { if (ctx && on) tone(rnd(1400, 1800), ctx.currentTime, 0.03, 0.2, 'square'); },
    line() { if (ctx && on) tone(rnd(1800, 2400), ctx.currentTime, 0.035, 0.12, 'square'); },
    hover() { if (ctx && on) tone(1900, ctx.currentTime, 0.04, 0.14, 'sine'); },
    click() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      tone(900, t, 0.05, 0.3, 'square');
      tone(1300, t + 0.045, 0.06, 0.25, 'square');
    },
    glitch() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      noise(t, 0.4, 0.5, 5000, 300, 0.7);
      tone(rnd(90, 140), t, 0.3, 0.35, 'sawtooth');
    },
    sweep(dur = 1.4) {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(2400, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.2);
    },
    reveal() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      noise(t, 0.5, 0.25, 400, 5000, 1);
      tone(1200, t + 0.35, 0.18, 0.5, 'triangle', 0.5);
    },
    open() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      noise(t, 0.35, 0.3, 300, 3500, 1);
      tone(520, t, 0.1, 0.4, 'triangle');
      tone(780, t + 0.08, 0.16, 0.4, 'triangle', 0.3);
    },
    toggle() {
      on = !on;
      if (ctx) on ? ctx.resume() : null;
      return on;
    },
  };
  window.SFX = SFX;
})();
