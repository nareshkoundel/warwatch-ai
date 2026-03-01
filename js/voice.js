/* ============================================================
   voice.js  —  VoiceService  (Deep Indian Broadcaster Voice)
   ============================================================
   TIER 1 — ElevenLabs "Aravind"  (neural, ultra-realistic)
             Requires free API key — set via in-app UI button.
             10 000 chars/month free at elevenlabs.io

   TIER 2 — StreamElements "Matthew"  (Amazon Polly Neural)
             No key needed. Deep authoritative male voice.

   TIER 3 — ResponsiveVoice "Hindi Male"  (zero config)
             Free CDN library. Genuine Indian accent, deep tone.
             Works immediately without any setup.

   TIER 4 — Web Speech API  (browser built-in fallback)
             pitch 0.72 + rate 0.88 = deep, slow, Punjabi feel.
   ============================================================ */

const VoiceService = (() => {

  /* ── ElevenLabs voice IDs (deep / Indian male priority) ── */
  const EL_VOICES = [
    'pFZP5JQG7iQjIQuC4Bku',   // Aravind  — deep Indian English male
    'onwK4e9ZLuTAKqWW03F9',   // Daniel   — deep British male
    'N2lVS1w4EtoT3dr4eOWO',   // Callum   — authoritative male
  ];
  const EL_MODEL = 'eleven_turbo_v2_5';

  /* ── State ── */
  let _audio  = null;
  let _rate   = 1.0;
  let _muted  = false;
  let _voices = [];
  let _elKey  = localStorage.getItem('el_api_key') || '';
  const _synth = window.speechSynthesis || null;

  /* ── Detect ResponsiveVoice library ── */
  function _rvAvailable() {
    return typeof window.responsiveVoice !== 'undefined'
        && typeof window.responsiveVoice.speak === 'function';
  }

  /* ── Web Speech voice priority list ── */
  const VOICE_PREF = [
    'Prabhat Online (Natural)',   // Edge Neural Indian English male
    'Prabhat',
    'Rishi',
    'Andrew Online (Natural)',
    'Eric Online (Natural)',
    'Brian Online (Natural)',
    'Guy Online (Natural)',
    'Google UK English Male',
    'Google US English',
    'Microsoft David',
    'Microsoft Mark',
    'Daniel',
  ];

  function _loadVoices() { _voices = _synth ? _synth.getVoices() : []; }
  _loadVoices();
  if (_synth) _synth.addEventListener('voiceschanged', _loadVoices);

  function _bestVoice() {
    const pool = _voices.length ? _voices : (_synth ? _synth.getVoices() : []);
    for (const frag of VOICE_PREF) {
      const v = pool.find(v => v.name.includes(frag));
      if (v) return v;
    }
    return pool.find(v => v.lang === 'en-IN')
        || pool.find(v => v.lang.startsWith('pa'))
        || pool.find(v => v.lang === 'en-US')
        || pool.find(v => v.lang.startsWith('en'))
        || pool[0] || null;
  }

  /* ── TIER 1: ElevenLabs ──────────────────────────────── */
  async function _elevenLabs(text) {
    if (!_elKey) throw new Error('No ElevenLabs key');
    const safe = text.replace(/[<>"&]/g, ' ').trim().slice(0, 900);
    for (const voiceId of EL_VOICES) {
      try {
        const resp = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
          {
            method: 'POST',
            headers: { 'xi-api-key': _elKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: safe, model_id: EL_MODEL,
              voice_settings: { stability: 0.62, similarity_boost: 0.78,
                                style: 0.42, use_speaker_boost: true },
            }),
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const url = URL.createObjectURL(await resp.blob());
        await _playAudio(url, true);
        return;
      } catch (e) { console.warn('[VoiceService] EL voice', voiceId, e.message); }
    }
    throw new Error('ElevenLabs exhausted');
  }

  /* ── TIER 2: StreamElements (Amazon Polly Neural "Matthew") */
  function _streamElements(text) {
    return new Promise((resolve, reject) => {
      const safe  = text.replace(/[<>"'&]/g, ' ').trim().slice(0, 900);
      const url   = 'https://api.streamelements.com/kappa/v2/speech'
                  + '?voice=Matthew&text=' + encodeURIComponent(safe);
      const audio = new Audio();
      const timer = setTimeout(() => { audio.onerror = null; reject(new Error('SE timeout')); }, 8000);
      audio.oncanplaythrough = () => {
        clearTimeout(timer);
        audio.oncanplaythrough = null;
        audio.playbackRate = Math.min(Math.max(_rate * 0.9, 0.5), 2.5);
        _audio = audio;
        audio.play().then(resolve).catch(e => { _audio = null; reject(e); });
      };
      audio.onerror = () => { clearTimeout(timer); reject(new Error('SE load error')); };
      audio.src = url;
      audio.load();
    });
  }

  /* ── TIER 3: ResponsiveVoice — Hindi Male (deep Indian) ──
     responsiveVoice.js is loaded as CDN in index.html.
     "Hindi Male" uses Google's Indian TTS engine.
     Deep pitch + slow rate = authoritative Punjabi broadcaster */
  function _responsiveVoice(text) {
    return new Promise((resolve, reject) => {
      if (!_rvAvailable()) { reject(new Error('RV not loaded')); return; }
      /* Cancel any active RV speech */
      try { window.responsiveVoice.cancel(); } catch(_) {}

      const safe = text.replace(/[<>"&]/g, ' ').trim().slice(0, 900);

      /* Prefer Hindi Male (Indian accent) → UK English Male fallback */
      const voiceName = window.responsiveVoice.voiceSupport('Hindi Male')
        ? 'Hindi Male'
        : 'UK English Male';

      const timer = setTimeout(() => reject(new Error('RV timeout')), 15000);

      window.responsiveVoice.speak(safe, voiceName, {
        pitch   : 0.2,    /* Very deep — Punjabi broadcaster resonance */
        rate    : 0.82,   /* Measured, deliberate delivery             */
        volume  : 1,
        onstart : () => clearTimeout(timer),
        onend   : resolve,
        onerror : () => { clearTimeout(timer); reject(new Error('RV error')); },
      });
    });
  }

  /* ── TIER 4: Web Speech API — deep pitch ─────────────── */
  function _webSpeech(text) {
    if (!_synth) return;
    _synth.cancel();
    const voice = _bestVoice();
    if (voice) console.info('[VoiceService] Web Speech:', voice.name, voice.lang);

    const chunks = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
    let i = 0;
    function next() {
      if (i >= chunks.length) return;
      const utt   = new SpeechSynthesisUtterance(chunks[i++].trim());
      utt.lang    = voice ? voice.lang : 'en-IN';
      utt.rate    = Math.min(Math.max(0.88 * _rate, 0.5), 2.0);
      utt.pitch   = 0.72;  /* Deep, resonant */
      utt.volume  = 1.0;
      if (voice) utt.voice = voice;
      utt.onend   = next;
      _synth.speak(utt);
    }
    next();
  }

  /* ── Audio Blob player ─────────────────────────────────── */
  function _playAudio(url, revoke) {
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      a.playbackRate = Math.min(Math.max(_rate * 0.9, 0.5), 2.5);
      _audio = a;
      a.onended = () => { _audio = null; if (revoke) URL.revokeObjectURL(url); resolve(); };
      a.onerror = () => { _audio = null; if (revoke) URL.revokeObjectURL(url); reject(new Error('play error')); };
      a.play().catch(reject);
    });
  }

  /* ── Broadcast formatter ─────────────────────────────── */
  function _fmt(text) {
    return text.replace(/breaking news from /i, 'This is breaking — ').replace(/_/g, ' ').trim();
  }

  /* ── Public: speak(text) ────────────────────────────────
     Cascade: ElevenLabs → StreamElements → ResponsiveVoice → Web Speech */
  async function speak(text) {
    if (_muted || !text) return;
    stop();
    _elKey = localStorage.getItem('el_api_key') || _elKey;
    const t = _fmt(text);

    /* Tier 1 — ElevenLabs (if key set) */
    if (_elKey) {
      try { await _elevenLabs(t); return; }
      catch (e) { console.warn('[VoiceService] ElevenLabs failed:', e.message); }
    }

    /* Tier 2 — StreamElements (Amazon Polly) */
    try { await _streamElements(t); return; }
    catch (e) { console.warn('[VoiceService] StreamElements failed:', e.message); }

    /* Tier 3 — ResponsiveVoice Hindi Male */
    try { await _responsiveVoice(t); return; }
    catch (e) { console.warn('[VoiceService] ResponsiveVoice failed:', e.message); }

    /* Tier 4 — Web Speech API */
    _webSpeech(t);
  }

  function stop() {
    if (_audio) { try { _audio.pause(); _audio.src = ''; } catch(_) {} _audio = null; }
    if (_synth) _synth.cancel();
    if (_rvAvailable()) { try { window.responsiveVoice.cancel(); } catch(_) {} }
  }

  function setMuted(val)  { _muted = !!val; if (_muted) stop(); }
  function getMuted()     { return _muted; }
  function setRate(r)     {
    _rate = parseFloat(r) || 1;
    if (_audio) _audio.playbackRate = Math.min(Math.max(_rate * 0.9, 0.5), 2.5);
  }
  function getRate()      { return _rate; }

  function setElevenLabsKey(key) {
    _elKey = (key || '').trim();
    if (_elKey) localStorage.setItem('el_api_key', _elKey);
    else localStorage.removeItem('el_api_key');
    console.info('[VoiceService] ElevenLabs key', _elKey ? 'saved ✓' : 'cleared');
    return _elKey ? '✓ ElevenLabs activated' : '✓ Key cleared';
  }
  function getElevenLabsKey() { return _elKey; }

  return { speak, stop, setMuted, getMuted, setRate, getRate, setElevenLabsKey, getElevenLabsKey };

})();

