/* ================================================
   audio.js  —  Web Audio API ambient + alerts
   ================================================ */
'use strict';

const AudioService = (() => {
  let ctx = null;
  let ambientNodes = [];
  let running = false;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---- Ambient: low drone + subtle static ---- */
  function createDrone(freq, gain) {
    const c = getCtx();
    const osc = c.createOscillator();
    const g   = c.createGain();
    const lfo = c.createOscillator();
    const lgn = c.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    lfo.type = 'sine';
    lfo.frequency.value = 0.08 + Math.random() * 0.04;
    lgn.gain.value = freq * 0.012;
    lfo.connect(lgn);
    lgn.connect(osc.frequency);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 3);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    lfo.start();
    return { osc, g, lfo };
  }

  function createNoise(gainVal) {
    const c = getCtx();
    const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.04;
    const src  = c.createBufferSource();
    const fil  = c.createBiquadFilter();
    const g    = c.createGain();
    src.buffer = buf;
    src.loop   = true;
    fil.type   = 'bandpass';
    fil.frequency.value = 400;
    fil.Q.value = 0.4;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gainVal, c.currentTime + 4);
    src.connect(fil);
    fil.connect(g);
    g.connect(c.destination);
    src.start();
    return { src, g };
  }

  function startAmbient() {
    if (running) return;
    running = true;
    ambientNodes = [
      createDrone(55,  0.06),
      createDrone(82,  0.04),
      createDrone(110, 0.02),
      createNoise(0.06)
    ];
  }

  function stopAmbient() {
    if (!running) return;
    const c = getCtx();
    ambientNodes.forEach(n => {
      try {
        const t = c.currentTime;
        if (n.g)   { n.g.gain.linearRampToValueAtTime(0, t + 2); }
        if (n.osc) { n.osc.stop(t + 2.1); }
        if (n.lfo) { n.lfo.stop(t + 2.1); }
        if (n.src) { n.src.stop(t + 2.1); }
      } catch(e) { /* already stopped */ }
    });
    ambientNodes = [];
    running = false;
  }

  function isAmbientOn() { return running; }

  /* ---- Alert: ascending tone sequence on BREAKING news ---- */
  function playAlert(severity = 'medium') {
    const c = getCtx();
    const tones = severity === 'critical'
      ? [523.25, 659.25, 783.99, 1046.5]   // C5 E5 G5 C6
      : [440, 523.25, 659.25];              // A4 C5 E5
    const now = c.currentTime;
    tones.forEach((freq, i) => {
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.13;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.18, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(env);
      env.connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /* ---- UI click tick ---- */
  function playTick() {
    const c = getCtx();
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 900;
    const t = c.currentTime;
    env.gain.setValueAtTime(0.07, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(env);
    env.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  return { startAmbient, stopAmbient, isAmbientOn, playAlert, playTick };
})();
