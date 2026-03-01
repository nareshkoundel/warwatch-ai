/* ================================================
   videoPlayer.js  —  AI Canvas Video Generator
   ================================================
   Renders a news story as a short "video" using:
     • HTML5 Canvas (animated background + text)
     • Web Speech API (TTS narration)
     • requestAnimationFrame loop
   ================================================ */

const VideoPlayer = (() => {

  /* -- DOM refs -- */
  const canvas     = document.getElementById('newsCanvas');
  const ctx        = canvas.getContext('2d');
  const overlay    = document.getElementById('videoOverlay');
  const voRegion   = document.getElementById('voRegion');
  const voSource   = document.getElementById('voSource');
  const voHeadline = document.getElementById('voHeadline');
  const voBody     = document.getElementById('voBody');
  const voTime     = document.getElementById('voTime');
  const progress   = document.getElementById('progressBar');
  const loading    = document.getElementById('videoLoading');
  const btnPP      = document.getElementById('btnPlayPause');
  const btnReplay  = document.getElementById('btnReplay');
  const btnMute    = document.getElementById('btnMute');
  const btnNext    = document.getElementById('btnNext');
  const btnAuto    = document.getElementById('btnAutoPlay');
  const aspTitle   = document.getElementById('aspTitle');
  const aspBody    = document.getElementById('aspBody');
  const aspTags    = document.getElementById('aspTags');
  const aspLink    = document.getElementById('aspLink');

  /* -- State -- */
  let currentArticle = null;
  let animFrame      = null;
  let startTime      = null;
  let duration       = 18000;  // 18 s per story
  let isPlaying      = false;
  let isMuted        = false;
  let autoPlay       = true;
  let onNextCallback = null;
  let particles      = [];
  let mapPoints      = [];
  let bgImage        = null;
  let bgImageLoaded  = false;
  let kenBurnsX      = 0;
  let kenBurnsY      = 0;
  let speedFactor    = 1.0;    // 0.5 / 1 / 1.5 / 2
  let typeText       = '';
  let typeIndex      = 0;
  let typeTimeout    = null;

  /* Wire speed selector */
  const speedSel = document.getElementById('speedSelect');
  if (speedSel) {
    speedSel.addEventListener('change', () => {
      const newFactor = parseFloat(speedSel.value) || 1;
      /* Preserve current fraction so progress bar doesn't jump */
      if (startTime) {
        const now         = performance.now();
        const oldElapsed  = Math.min(now - startTime, duration);
        const fraction    = oldElapsed / duration;
        duration          = Math.round(18000 / newFactor);
        startTime         = now - fraction * duration;
      } else {
        duration = Math.round(18000 / newFactor);
      }
      speedFactor = newFactor;
      VoiceService.setRate(speedFactor);
    });
  }

  /* -- TTS delegated to VoiceService (voice.js) -- */

  /* -- Particle system -- */
  function initParticles(color) {
    particles = Array.from({length: 60}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.1,
      color
    }));
  }

  /* -- Map points for radar effect -- */
  function initMapPoints(region) {
    const regionCenters = {
      ISRAEL:      { x: 560, y: 200 },
      IRAN:        { x: 590, y: 195 },
      UKRAINE:     { x: 530, y: 155 },
      PAKISTAN:    { x: 630, y: 205 },
      AFGHANISTAN: { x: 609, y: 200 },
      USA:         { x: 220, y: 195 },
      MIDDLE_EAST: { x: 565, y: 210 },
      WORLD:       { x: 400, y: 225 }
    };
    const cx   = canvas.width;
    const cy   = canvas.height;
    const cent = regionCenters[region] || { x: cx / 2, y: cy / 2 };
    const scx  = (cent.x / 800) * cx;
    const scy  = (cent.y / 450) * cy;
    mapPoints  = Array.from({length: 5}, (_, i) => ({
      x:    scx + (Math.random() - 0.5) * 80,
      y:    scy + (Math.random() - 0.5) * 50,
      r:    0,
      maxR: 30 + Math.random() * 20,
      speed: 0.5 + Math.random() * 0.5,
      alpha: 0.8
    }));
  }

  /* -- Draw background (with optional Ken Burns image) -- */
  function drawBackground(progress01, accentHex) {
    const W = canvas.width, H = canvas.height;

    if (bgImageLoaded && bgImage) {
      // Ken Burns: slow zoom 1.0 → 1.14 + gentle pan
      const scale  = 1 + 0.14 * progress01;
      const panX   = kenBurnsX * progress01 * 20;
      const panY   = kenBurnsY * progress01 * 12;
      const sw     = W * scale;
      const sh     = H * scale;
      const sx     = (W - sw) / 2 + panX;
      const sy     = (H - sh) / 2 + panY;
      ctx.drawImage(bgImage, sx, sy, sw, sh);
      // Dark cinematic vignette over the photo
      const vign = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, W*0.8);
      vign.addColorStop(0, 'rgba(0,0,0,0.35)');
      vign.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, W, H);
    } else {
      // Dark gradient base
      const grad = ctx.createRadialGradient(W*0.5, H*0.5, 10, W*0.5, H*0.5, W*0.7);
      grad.addColorStop(0, '#0d0d1a');
      grad.addColorStop(1, '#040408');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Animated scanlines
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();

    // Particles
    ctx.save();
    particles.forEach(p => {
      p.x = (p.x + p.vx + W) % W;
      p.y = (p.y + p.vy + H) % H;
      ctx.globalAlpha = p.alpha * (0.3 + 0.7 * progress01);
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Accent line sweep
    const sweepX = W * progress01;
    const lineGrad = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 5, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(1, accentHex + '88');
    ctx.fillStyle   = lineGrad;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, sweepX, H);
    ctx.globalAlpha = 1;

    // Vertical accent stripe
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(0.5, accentHex + '33');
    vg.addColorStop(1, 'transparent');
    ctx.fillStyle = vg;
    ctx.fillRect(sweepX - 2, 0, 3, H);

    // Map circle pings
    mapPoints.forEach(mp => {
      mp.r = (mp.r + mp.speed) % mp.maxR;
      const fade = 1 - mp.r / mp.maxR;
      ctx.save();
      ctx.globalAlpha = fade * 0.6;
      ctx.strokeStyle = accentHex;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, mp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.fillStyle   = accentHex;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  /* -- Draw grid -- */
  function drawGrid(accentHex) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = accentHex;
    ctx.lineWidth   = 0.5;
    const W = canvas.width, H = canvas.height;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  /* -- Draw HUD corners -- */
  function drawHUD(accentHex, region, source, elapsed01) {
    const W = canvas.width, H = canvas.height;
    const sz = 20;
    ctx.save();
    ctx.strokeStyle = accentHex;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.7;
    // Corners
    [[0,0],[W,0],[0,H],[W,H]].forEach(([cx,cy]) => {
      const sx = cx === 0 ? cx : cx - sz;
      const sy = cy === 0 ? cy : cy - sz;
      ctx.strokeRect(sx, sy, sz, sz);
    });

    // Top-right: source tag
    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = accentHex;
    ctx.font        = `bold 11px "Orbitron", monospace`;
    ctx.textAlign   = 'right';
    ctx.fillText(source.toUpperCase(), W - 30, 18);

    // Bottom-left: progress indicator
    ctx.fillStyle   = 'rgba(255,255,255,0.3)';
    ctx.textAlign   = 'left';
    ctx.font        = `10px monospace`;
    const secs = Math.floor(elapsed01 * (duration / 1000));
    const total = Math.floor(duration / 1000);
    ctx.fillText(`${secs}s / ${total}s`, 30, H - 12);

    // Region watermark
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = '#ffffff';
    ctx.font        = `bold 80px "Orbitron", monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText(region, W / 2, H / 2 + 30);

    ctx.restore();
  }

  /* -- Typewriter effect (overlay, not canvas) -- */
  function startTypewriter(text, el) {
    if (typeTimeout) clearTimeout(typeTimeout);
    typeText  = text;
    typeIndex = 0;
    el.textContent = '';
    function type() {
      if (typeIndex < typeText.length) {
        el.textContent += typeText[typeIndex++];
        typeTimeout = setTimeout(type, 18);
      }
    }
    type();
  }

  /* -- TTS: delegates to VoiceService (StreamElements neural → Web Speech API) -- */
  function speak(text) {
    if (isMuted) return;
    VoiceService.setRate(speedFactor);
    VoiceService.speak(text);
  }

  function stopSpeech() {
    VoiceService.stop();
  }

  /* ----------------------------------------
     Main render loop
  ----------------------------------------- */
  function renderLoop(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed  = timestamp - startTime;
    const elapsed01= Math.min(elapsed / duration, 1);
    const accentHex= currentArticle?.regionColor || '#ff2200';

    // Clear & draw
    drawBackground(elapsed01, accentHex);
    drawGrid(accentHex);
    drawHUD(accentHex, currentArticle?.region || 'WORLD',
            currentArticle?.source || '', elapsed01);

    // Update progress bar
    progress.style.width = `${elapsed01 * 100}%`;

    if (elapsed01 >= 1) {
      isPlaying = false;
      btnPP.textContent = '▶';
      if (autoPlay && onNextCallback) {
        onNextCallback();
      }
      return;
    }

    if (isPlaying) {
      animFrame = requestAnimationFrame(renderLoop);
    }
  }

  /* ----------------------------------------
     Public: play(article)
  ----------------------------------------- */
  function play(article) {
    if (!article) return;
    currentArticle = article;
    stopSpeech();
    cancelAnimationFrame(animFrame);
    startTime  = null;
    isPlaying  = true;
    btnPP.textContent = '⏸';
    progress.style.width = '0%';

    // Show loading briefly
    loading.classList.add('show');
    setTimeout(() => loading.classList.remove('show'), 600);

    // Init canvas effects
    initParticles(article.regionColor || '#ff2200');
    initMapPoints(article.region || 'WORLD');

    // Ken Burns: preload thumbnail for canvas display
    // NOTE: no crossOrigin needed — canvas only uses drawImage (not toDataURL)
    bgImage = null;
    bgImageLoaded = false;
    kenBurnsX = (Math.random() > 0.5 ? 1 : -1);
    kenBurnsY = (Math.random() > 0.5 ? 0.5 : -0.5);

    const thumbSrc = article.thumbnail || article.fallbackThumb || null;
    if (thumbSrc) {
      const tryLoad = (src) => {
        const img = new Image();
        // No crossOrigin — avoids CORS block; drawImage still works fine
        img.onload  = () => { bgImage = img; bgImageLoaded = true; };
        img.onerror = () => {
          // If direct URL failed, try through allorigins proxy (no crossOrigin needed)
          if (!src.includes('allorigins.win')) {
            tryLoad('https://api.allorigins.win/raw?url=' + encodeURIComponent(src));
          }
        };
        img.src = src;
      };
      tryLoad(thumbSrc);
    }

    // Update overlay
    voRegion.textContent = article.region;
    voRegion.style.background = article.regionColor || '#ff2200';
    voSource.textContent    = `📡 ${article.source}  •  ${article.timeAgo}`;
    voTime.textContent      = new Date(article.pubDate).toUTCString().slice(0,25);
    startTypewriter(article.title, voHeadline);
    setTimeout(() => startTypewriter(article.description?.slice(0,200) || '', voBody), 1600);

    // Update AI summary panel
    aspTitle.textContent = article.title;
    aspBody.textContent  = article.aiSummary;
    aspLink.href         = article.link;
    aspTags.innerHTML    = article.tags.map(t =>
      `<span class="tag">${t}</span>`
    ).join('');

    // TTS — read headline + summary
    const speakText = `Breaking news from ${article.region.replace('_',' ')}. 
                       ${article.title}. 
                       ${article.aiSummary}`;
    setTimeout(() => speak(speakText), 700);

    // Start render loop
    animFrame = requestAnimationFrame(renderLoop);
  }

  /* ----------------------------------------
     Controls
  ----------------------------------------- */
  function pause() {
    isPlaying = false;
    btnPP.textContent = '▶';
    stopSpeech();
    cancelAnimationFrame(animFrame);
  }

  function resume() {
    if (!currentArticle) return;
    isPlaying = true;
    btnPP.textContent = '⏸';
    animFrame = requestAnimationFrame(renderLoop);
  }

  btnPP.addEventListener('click', () => {
    if (isPlaying) pause(); else resume();
  });

  btnReplay.addEventListener('click', () => {
    if (currentArticle) play(currentArticle);
  });

  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    btnMute.textContent = isMuted ? '🔇' : '🔊';
    VoiceService.setMuted(isMuted);
  });

  btnNext.addEventListener('click', () => {
    if (onNextCallback) onNextCallback();
  });

  btnAuto.addEventListener('click', () => {
    autoPlay = !autoPlay;
    btnAuto.textContent = autoPlay ? 'AUTO ✓' : 'AUTO ✗';
    btnAuto.classList.toggle('off', !autoPlay);
  });

  /* ----------------------------------------
     Draw idle screen on startup
  ----------------------------------------- */
  function drawIdle() {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);
    drawGrid('#ff2200');

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#ff2200';
    ctx.font        = `bold 28px "Orbitron", monospace`;
    ctx.globalAlpha = 0.8;
    ctx.fillText('⚡ WARWATCH AI', W/2, H/2 - 20);
    ctx.font        = `12px "Inter", sans-serif`;
    ctx.fillStyle   = '#667';
    ctx.globalAlpha = 1;
    ctx.fillText('Select a news item to play a short AI video', W/2, H/2 + 14);
    ctx.restore();
  }

  drawIdle();

  function setSpeed(val) {
    speedFactor = parseFloat(val) || 1;
    duration = Math.round(18000 / speedFactor);
    VoiceService.setRate(speedFactor);
  }

  return {
    play,
    pause,
    resume,
    setSpeed,
    setOnNext(cb) { onNextCallback = cb; },
    isPlaying: () => isPlaying,
    current: () => currentArticle
  };
})();
