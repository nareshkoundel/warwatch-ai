/* ================================================
   app.js  --  Main application orchestrator (v2)
   ================================================ */

/* Global image fallback handler — called by card img onerror.
   Uses data-fb (SVG data URI) so it can never fail again.     */
window.__imgFb = function(img) {
  img.onerror = null;                 // stop infinite loop
  var fb = img.dataset.fb;
  if (fb && fb !== img.src) {
    img.src = fb;
  } else {
    /* Even the SVG somehow failed — hide the image wrap entirely */
    var wrap = img.closest('.card-img-wrap');
    if (wrap) wrap.style.display = 'none';
  }
};

(async () => {

  /* ================================================================
     DOM REFS
  ================================================================ */
  const newsFeed    = document.getElementById('newsFeed');
  const feedCount   = document.getElementById('feedCount');
  const tickerEl    = document.getElementById('tickerContent');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn  = document.getElementById('refreshBtn');
  const liveClock   = document.getElementById('liveClock');
  const regionNav   = document.getElementById('regionNav');
  const regionBtns  = regionNav ? regionNav.querySelectorAll('.region-btn') : [];
  const statSources = document.getElementById('statSources');
  const statStories = document.getElementById('statStories');
  const statUpdated = document.getElementById('statUpdated');
  const toast       = document.getElementById('toast');
  const aspThreat   = document.getElementById('aspThreat');

  /* ================================================================
     STATE
  ================================================================ */
  let allArticles      = [];
  let filteredArticles = [];
  let activeRegion     = 'ALL';
  let activeCardEl     = null;
  let autoRefreshTimer = null;
  let currentIndex     = 0;
  let mapInited        = false;
  let statsVisible     = false;
  let notifyEnabled    = false;
  let seenBreaking     = new Set();
  const REFRESH_MS     = 5 * 60 * 1000;

  /* ================================================================
     TOAST
  ================================================================ */
  function showToast(msg, duration) {
    duration = duration || 3200;
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, duration);
  }

  /* ================================================================
     CLOCK
  ================================================================ */
  function updateClock() {
    if (!liveClock) return;
    var n = new Date();
    liveClock.textContent =
      String(n.getUTCHours()).padStart(2,'0') + ':' +
      String(n.getUTCMinutes()).padStart(2,'0') + ':' +
      String(n.getUTCSeconds()).padStart(2,'0') + ' UTC';
  }
  setInterval(updateClock, 1000);
  updateClock();

  /* ================================================================
     TIME-AGO REFRESH
  ================================================================ */
  setInterval(function() {
    document.querySelectorAll('.card-time[data-pub]').forEach(function(el) {
      var diff = (Date.now() - new Date(el.dataset.pub).getTime()) / 1000;
      if (diff < 60)       el.textContent = Math.floor(diff) + 's ago';
      else if (diff<3600)  el.textContent = Math.floor(diff/60) + 'm ago';
      else if (diff<86400) el.textContent = Math.floor(diff/3600) + 'h ago';
      else                 el.textContent = Math.floor(diff/86400) + 'd ago';
    });
  }, 30000);

  /* ================================================================
     TAB SWITCHING
  ================================================================ */
  var tabMain  = document.getElementById('tabMain');
  var tabMap   = document.getElementById('tabMap');
  var tabStats = document.getElementById('tabStats');
  var tabBar   = document.getElementById('tabBar');

  function switchTab(name) {
    [tabMain, tabMap, tabStats].forEach(function(t) { if (t) t.style.display = 'none'; });
    if (tabBar) tabBar.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    if (name === 'main'  && tabMain)  { tabMain.style.display  = ''; }
    if (name === 'map'   && tabMap)   {
      tabMap.style.display = '';
      if (!mapInited) { MapService.init(); mapInited = true; }
      else { setTimeout(function(){ MapService.init(); }, 50); }
      MapService.update(allArticles);
    }
    if (name === 'stats' && tabStats) {
      tabStats.style.display = '';
      statsVisible = true;
      StatsService.update(allArticles);
    }
  }

  if (tabBar) {
    tabBar.addEventListener('click', function(e) {
      var btn = e.target.closest('.tab-btn');
      if (btn) switchTab(btn.dataset.tab);
    });
  }
  switchTab('main');

  if (typeof MapService !== 'undefined') {
    MapService.onRegionFilter(function(region) {
      switchTab('main');
      setRegion(region);
    });
  }

  /* ================================================================
     REGION FILTER
  ================================================================ */
  function setRegion(region) {
    activeRegion = region;
    regionBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.region === region); });
    applyFilters();
    if (typeof MapService !== 'undefined' && mapInited) MapService.flyTo(region);
  }

  if (regionNav) {
    regionNav.addEventListener('click', function(e) {
      var btn = e.target.closest('.region-btn');
      if (btn) setRegion(btn.dataset.region);
    });
  }

  /* ================================================================
     SEARCH
  ================================================================ */
  if (searchInput) searchInput.addEventListener('input', function() { applyFilters(); });

  /* ================================================================
     VIEW MODE
  ================================================================ */
  var viewModeBtns = document.getElementById('viewModeBtns');
  if (viewModeBtns) {
    viewModeBtns.addEventListener('click', function(e) {
      var btn = e.target.closest('.vm-btn');
      if (!btn) return;
      var mode = btn.dataset.mode;
      viewModeBtns.querySelectorAll('.vm-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
      if (newsFeed) {
        newsFeed.classList.toggle('grid-mode', mode === 'grid');
        newsFeed.classList.toggle('list-mode', mode === 'list');
      }
    });
  }

  /* ================================================================
     HELPERS
  ================================================================ */
  function escHtml(str) {
    return (str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  /* ================================================================
     APPLY FILTERS
  ================================================================ */
  function applyFilters() {
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    filteredArticles = allArticles.filter(function(a) {
      var regionOk = activeRegion === 'ALL' || a.region === activeRegion;
      var searchOk = !q ||
        a.title.toLowerCase().includes(q) ||
        (a.description||'').toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        a.region.toLowerCase().includes(q);
      return regionOk && searchOk;
    });
    renderFeed(filteredArticles);
  }

  /* ================================================================
     RENDER FEED
  ================================================================ */
  function renderFeed(articles) {
    if (feedCount) feedCount.textContent = articles.length + ' stories';
    if (!newsFeed) return;

    if (articles.length === 0) {
      newsFeed.innerHTML = '<div class="no-results"><span>🔍</span>No stories found.</div>';
      return;
    }

    var fragment = document.createDocumentFragment();
    articles.forEach(function(article, idx) {
      var card = document.createElement('div');
      card.className = 'news-card';
      card.dataset.idx = idx;
      card.style.setProperty('--card-color', article.regionColor);

      var breaking = article.isBreaking ? '<span class="breaking-badge">BREAKING</span>' : '';

      var typeColors = { rss:'#455a64', reddit:'#ff4500', telegram:'#29b6f6' };
      var typeLabels = { rss:'RSS', reddit:'REDDIT', telegram:'TELEGRAM' };
      var tc = typeColors[article.sourceType] || '#455a64';
      var tl = typeLabels[article.sourceType] || 'RSS';
      var typeBadge = '<span class="source-type-badge" style="background:' + tc + '18;color:' + tc + ';border-color:' + tc + '44">' + (article.sourceIcon||'📡') + ' ' + tl + '</span>';

      // Use thumbnail from RSS, or fallback region SVG (guaranteed to display)
      var cardImg  = article.thumbnail || article.fallbackThumb || null;
      var fallback = article.fallbackThumb || '';
      /* Store fallback in data-fb; __imgFb() is a safe global handler */
      var thumb = cardImg
        ? '<div class="card-img-wrap"><img class="card-img" src="' + cardImg + '" data-fb="' + escHtml(fallback) + '" onerror="__imgFb(this)" loading="lazy" alt=""></div>'
        : '';

      var thr = article.threat || {};
      var thrBadge = thr.level ? '<span class="card-threat" data-level="' + thr.level + '">' + thr.level + '</span>' : '';

      card.innerHTML =
        thumb +
        '<div class="card-top">' +
          '<span class="card-region-badge" style="color:' + article.regionColor + ';border-color:' + article.regionColor + '40;background:' + article.regionColor + '18;">' + article.region.replace('_',' ') + '</span>' +
          '<span class="card-source">' + typeBadge + ' ' + escHtml(article.source) + '</span>' +
          thrBadge +
        '</div>' +
        '<div class="card-title">' + breaking + escHtml(article.title) + '</div>' +
        '<div class="card-snippet">' + escHtml((article.description||'').slice(0,160)) + '</div>' +
        '<div class="card-footer">' +
          '<span class="card-time" data-pub="' + article.pubDate + '">' + article.timeAgo + '</span>' +
          '<span class="card-play-btn">&#9654; Play Video</span>' +
        '</div>';

      card.addEventListener('click', (function(a, i) {
        return function() { playArticle(a, i, card); };
      })(article, idx));
      fragment.appendChild(card);
    });

    newsFeed.innerHTML = '';
    newsFeed.appendChild(fragment);
  }

  /* ================================================================
     PLAY ARTICLE
  ================================================================ */
  function playArticle(article, idx, cardEl) {
    currentIndex = idx;
    if (activeCardEl) activeCardEl.classList.remove('active');
    activeCardEl = cardEl;
    if (cardEl) {
      cardEl.classList.add('active');
      cardEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
    if (aspThreat && article.threat) {
      aspThreat.textContent   = article.threat.level;
      aspThreat.dataset.level = article.threat.level;
    }
    if (typeof AudioService !== 'undefined') {
      if (article.threat && article.threat.level === 'CRITICAL') AudioService.playAlert('critical');
      else if (article.threat && article.threat.level === 'HIGH') AudioService.playAlert('medium');
    }
    VideoPlayer.play(article);
  }

  /* ================================================================
     AUTO-NEXT
  ================================================================ */
  VideoPlayer.setOnNext(function() {
    var nextIdx  = (currentIndex + 1) % filteredArticles.length;
    var nextCard = newsFeed && newsFeed.querySelector('[data-idx="' + nextIdx + '"]');
    if (filteredArticles[nextIdx]) playArticle(filteredArticles[nextIdx], nextIdx, nextCard);
  });

  /* ================================================================
     PUSH NOTIFICATIONS
  ================================================================ */
  var btnNotify = document.getElementById('btnNotify');
  if (btnNotify) {
    btnNotify.addEventListener('click', async function() {
      if (!('Notification' in window)) { showToast('Notifications not supported.'); return; }
      var perm = await Notification.requestPermission();
      if (perm === 'granted') {
        notifyEnabled = true;
        btnNotify.classList.add('active');
        showToast('🔔 Push notifications enabled!');
      } else {
        showToast('🔕 Permission denied.');
      }
    });
  }

  function checkBreakingNotify(articles) {
    if (!notifyEnabled) return;
    articles.forEach(function(a) {
      if (!a.isBreaking || seenBreaking.has(a.title)) return;
      seenBreaking.add(a.title);
      try { new Notification('BREAKING: ' + a.title, { body: (a.description||'').slice(0,120), tag: a.title.slice(0,40) }); } catch(e) {}
    });
  }

  /* ================================================================
     SHARE
  ================================================================ */
  async function shareArticle(article) {
    if (!article) return;
    var shareData = { title: article.title, text: article.aiSummary || (article.description||'').slice(0,200), url: article.link || window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch(e) {}
    }
    try {
      await navigator.clipboard.writeText(article.title + '\n' + article.link);
      showToast('📋 Link copied!');
    } catch(e) { showToast('Could not share.'); }
  }

  var btnShare     = document.getElementById('btnShare');
  var btnShareCard = document.getElementById('btnShareCard');
  if (btnShare)     btnShare.addEventListener('click',     function() { shareArticle(VideoPlayer.current()); });
  if (btnShareCard) btnShareCard.addEventListener('click', function() { shareArticle(VideoPlayer.current()); });

  /* ================================================================
     TRANSLATE
  ================================================================ */
  var btnTranslate    = document.getElementById('btnTranslate');
  var translateResult = document.getElementById('translateResult');
  var translateText   = document.getElementById('translateText');
  var trClose         = translateResult && translateResult.querySelector('.tr-close');

  if (translateResult) translateResult.style.display = 'none';

  if (btnTranslate) {
    btnTranslate.addEventListener('click', async function() {
      var art = VideoPlayer.current();
      if (!art) { showToast('Play an article first.'); return; }
      if (!translateResult) return;
      translateResult.style.display = '';
      if (translateText) translateText.textContent = 'Translating...';
      btnTranslate.disabled = true;
      try {
        var out = await TranslateService.translateArticle(art);
        if (translateText) translateText.innerHTML = '<strong>' + escHtml(out.title) + '</strong><br><br>' + escHtml(out.body);
      } catch(e) {
        if (translateText) translateText.textContent = 'Translation failed: ' + e.message;
      }
      btnTranslate.disabled = false;
    });
  }
  if (trClose && translateResult) {
    trClose.addEventListener('click', function() { translateResult.style.display = 'none'; });
  }

  /* ================================================================
     COMPARE
  ================================================================ */
  var btnCompare   = document.getElementById('btnCompare');
  var compareModal = document.getElementById('compareModal');
  var compareQuery = document.getElementById('compareQuery');
  var compareGrid  = document.getElementById('compareGrid');
  var cmpClose     = compareModal && compareModal.querySelector('.modal-close');

  function openCompare() {
    var art = VideoPlayer.current();
    if (!art || !compareModal) { showToast('Play an article first.'); return; }
    var words = art.title.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').filter(function(w){ return w.length > 4; }).slice(0,6);
    var related = allArticles
      .filter(function(a){ return a.title !== art.title; })
      .map(function(a) {
        var t = a.title.toLowerCase();
        var score = words.filter(function(w){ return t.includes(w); }).length;
        return { a: a, score: score };
      })
      .filter(function(x){ return x.score > 0; })
      .sort(function(x,y){ return y.score - x.score; })
      .slice(0,6)
      .map(function(x){ return x.a; });

    if (compareQuery) compareQuery.textContent = 'Coverage of: "' + art.title.slice(0,60) + '...' + '"';
    if (!compareGrid) return;

    if (related.length === 0) {
      compareGrid.innerHTML = '<div class="compare-no-results">No related articles found.</div>';
    } else {
      compareGrid.innerHTML = related.map(function(a, i) {
        return '<div class="compare-card" data-idx="' + i + '">' +
          '<div class="cc-source">' + escHtml(a.source) + ' · ' + a.region + '</div>' +
          '<div class="cc-title">'  + escHtml(a.title)  + '</div>' +
          '<div class="cc-body">'   + escHtml((a.aiSummary||a.description||'').slice(0,180)) + '</div>' +
          '<div class="cc-time">'   + a.timeAgo + '</div>' +
          '<div class="cc-play">&#9654;</div>' +
        '</div>';
      }).join('');
      compareGrid.querySelectorAll('.compare-card').forEach(function(card, i) {
        card.addEventListener('click', function() {
          compareModal.style.display = 'none';
          var art2 = related[i];
          var card2 = newsFeed && newsFeed.querySelector('[data-idx="' + filteredArticles.indexOf(art2) + '"]');
          playArticle(art2, filteredArticles.indexOf(art2), card2);
        });
      });
    }
    compareModal.style.display = 'flex';
  }

  if (btnCompare)   btnCompare.addEventListener('click', openCompare);
  if (cmpClose)     cmpClose.addEventListener('click', function() { compareModal.style.display='none'; });
  if (compareModal) {
    compareModal.style.display = 'none';
    compareModal.addEventListener('click', function(e) { if (e.target===compareModal) compareModal.style.display='none'; });
  }

  /* ================================================================
     KEYBOARD SHORTCUTS MODAL
  ================================================================ */
  var btnShortcuts   = document.getElementById('btnShortcuts');
  var shortcutsModal = document.getElementById('shortcutsModal');
  var skClose        = shortcutsModal && shortcutsModal.querySelector('.modal-close');

  function toggleShortcuts() {
    if (!shortcutsModal) return;
    shortcutsModal.style.display = shortcutsModal.style.display === 'flex' ? 'none' : 'flex';
  }
  if (btnShortcuts)   btnShortcuts.addEventListener('click', toggleShortcuts);
  if (skClose)        skClose.addEventListener('click', function(){ shortcutsModal.style.display='none'; });
  if (shortcutsModal) {
    shortcutsModal.style.display = 'none';
    shortcutsModal.addEventListener('click', function(e){ if(e.target===shortcutsModal) shortcutsModal.style.display='none'; });
  }

  /* ================================================================
     AI VOICE KEY MODAL
  ================================================================ */
  var btnVoiceKey    = document.getElementById('btnVoiceKey');
  var voiceKeyModal  = document.getElementById('voiceKeyModal');
  var vkClose        = document.getElementById('voiceKeyClose');
  var vkActivateBtn  = document.getElementById('vkActivateBtn');
  var vkClearBtn     = document.getElementById('vkClearBtn');
  var vkKeyInput     = document.getElementById('vkKeyInput');
  var vkFeedback     = document.getElementById('vkFeedback');
  var vkElBadge      = document.getElementById('vkElBadge');
  var vkTierEl       = document.getElementById('vkTierEl');
  var vkStatusText   = document.getElementById('vkStatusText');

  function _vkUpdateStatus() {
    var key = typeof VoiceService !== 'undefined' ? VoiceService.getElevenLabsKey() : '';
    if (key) {
      if (vkElBadge)   vkElBadge.textContent   = '✅ ACTIVE';
      if (vkTierEl)    vkTierEl.classList.add('active');
      if (vkStatusText) vkStatusText.textContent = '🎙️ ElevenLabs Neural Indian Voice Active';
      if (btnVoiceKey) { btnVoiceKey.textContent = '🎙️ Voice ON'; btnVoiceKey.classList.add('active'); }
    } else {
      if (vkElBadge)   vkElBadge.textContent   = '⚡ UPGRADE';
      if (vkTierEl)    vkTierEl.classList.remove('active');
      if (vkStatusText) vkStatusText.textContent = '🔊 Using Hindi Male voice (built-in)';
      if (btnVoiceKey) { btnVoiceKey.textContent = '🎙️ AI Voice'; btnVoiceKey.classList.remove('active'); }
    }
  }

  function openVoiceKeyModal() {
    if (!voiceKeyModal) return;
    var key = typeof VoiceService !== 'undefined' ? VoiceService.getElevenLabsKey() : '';
    if (vkKeyInput) vkKeyInput.value = key ? '••••••••••••••••' : '';
    if (vkFeedback) vkFeedback.textContent = '';
    _vkUpdateStatus();
    voiceKeyModal.style.display = 'flex';
  }

  if (btnVoiceKey)   btnVoiceKey.addEventListener('click', openVoiceKeyModal);
  if (vkClose)       vkClose.addEventListener('click', function(){ voiceKeyModal.style.display='none'; });
  if (voiceKeyModal) voiceKeyModal.addEventListener('click', function(e){ if(e.target===voiceKeyModal) voiceKeyModal.style.display='none'; });

  if (vkActivateBtn) {
    vkActivateBtn.addEventListener('click', function() {
      var key = (vkKeyInput ? vkKeyInput.value.trim() : '').replace(/•/g,'');
      if (!key) { if(vkFeedback) { vkFeedback.textContent = '⚠️ Please paste your API key first.'; vkFeedback.style.color='#ffc107'; } return; }
      if (typeof VoiceService === 'undefined') return;
      VoiceService.setElevenLabsKey(key);
      if (vkFeedback) { vkFeedback.textContent = '✅ ElevenLabs Aravind voice activated! Next story will use it.'; vkFeedback.style.color='#00c853'; }
      _vkUpdateStatus();
      showToast('🎙️ ElevenLabs deep Indian voice activated!');
      setTimeout(function(){ voiceKeyModal.style.display='none'; }, 1800);
    });
  }

  if (vkClearBtn) {
    vkClearBtn.addEventListener('click', function() {
      if (typeof VoiceService !== 'undefined') VoiceService.setElevenLabsKey('');
      if (vkKeyInput) vkKeyInput.value = '';
      if (vkFeedback) { vkFeedback.textContent = '✅ Key cleared. Using built-in Hindi Male voice.'; vkFeedback.style.color='#aaa'; }
      _vkUpdateStatus();
    });
  }

  /* Run status update on load */
  _vkUpdateStatus();
  var btnAmbient       = document.getElementById('btnAmbient');
  var ambientIndicator = document.getElementById('ambientIndicator');

  if (btnAmbient) {
    btnAmbient.addEventListener('click', function() {
      if (typeof AudioService === 'undefined') { showToast('Audio unavailable.'); return; }
      if (AudioService.isAmbientOn()) {
        AudioService.stopAmbient();
        btnAmbient.textContent = '🔇';
        btnAmbient.classList.remove('active');
        if (ambientIndicator) ambientIndicator.classList.remove('show');
        showToast('🔇 Ambient audio off');
      } else {
        AudioService.startAmbient();
        btnAmbient.textContent = '🔊';
        btnAmbient.classList.add('active');
        if (ambientIndicator) ambientIndicator.classList.add('show');
        showToast('🔊 Ambient audio on');
      }
    });
  }

  /* ================================================================
     BREAKING BANNER
  ================================================================ */
  function showBreakingBanner(article) {
    var existing = document.querySelector('.breaking-alert');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'breaking-alert';
    el.innerHTML =
      '<div class="ba-label">BREAKING</div>' +
      '<div class="ba-title">' + escHtml(article.title) + '</div>' +
      '<div class="ba-source">' + escHtml(article.source) + ' · ' + article.timeAgo + '</div>' +
      '<button class="ba-close" title="Dismiss">x</button>';
    el.querySelector('.ba-close').addEventListener('click', function(e){ e.stopPropagation(); el.remove(); });
    el.addEventListener('click', function() {
      var idx  = filteredArticles.indexOf(article);
      var card = newsFeed && newsFeed.querySelector('[data-idx="' + (idx>=0?idx:0) + '"]');
      playArticle(article, idx>=0?idx:0, card);
      switchTab('main'); el.remove();
    });
    document.body.appendChild(el);
    setTimeout(function(){ if(el.parentNode) el.remove(); }, 8000);
  }

  /* ================================================================
     SPEED CONTROL
  ================================================================ */
  var speedSelect = document.getElementById('speedSelect');
  if (speedSelect) {
    speedSelect.addEventListener('change', function() {
      VideoPlayer.setSpeed(parseFloat(speedSelect.value) || 1);
    });
  }

  /* ================================================================
     KEYBOARD SHORTCUTS
  ================================================================ */
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); document.getElementById('btnPlayPause') && document.getElementById('btnPlayPause').click(); break;
      case 'ArrowRight': document.getElementById('btnNext')   && document.getElementById('btnNext').click();   break;
      case 'ArrowLeft':  document.getElementById('btnReplay') && document.getElementById('btnReplay').click(); break;
      case 'KeyM':       document.getElementById('btnMute')   && document.getElementById('btnMute').click();   break;
      case 'KeyR':       refreshBtn && refreshBtn.click(); break;
      case 'KeyA':       btnAmbient && btnAmbient.click(); break;
      case 'KeyS':       searchInput && searchInput.focus(); break;
      case 'KeyT':       btnTranslate && btnTranslate.click(); break;
      case 'KeyC':       openCompare(); break;
      case 'Digit1':     switchTab('main');  break;
      case 'Digit2':     switchTab('map');   break;
      case 'Digit3':     switchTab('stats'); break;
      case 'KeyG':       viewModeBtns && viewModeBtns.querySelector('[data-mode="grid"]') && viewModeBtns.querySelector('[data-mode="grid"]').click(); break;
      case 'Escape':
        if (shortcutsModal && shortcutsModal.style.display==='flex') shortcutsModal.style.display='none';
        if (compareModal   && compareModal.style.display==='flex')   compareModal.style.display='none';
        if (voiceKeyModal  && voiceKeyModal.style.display==='flex')  voiceKeyModal.style.display='none';
        break;
      case 'Slash':
      case 'KeyH':
        toggleShortcuts(); break;
    }
  });

  /* ================================================================
     LOAD NEWS
  ================================================================ */
  async function loadNews() {
    if (newsFeed) newsFeed.innerHTML = '<div class="skeleton-loader">' + Array(6).fill('<div class="sk-card"></div>').join('') + '</div>';
    if (refreshBtn) { refreshBtn.textContent='Refreshing...'; refreshBtn.disabled=true; }

    try {
      allArticles = await NewsService.fetchAll();
      applyFilters();
      if (tickerEl) tickerEl.textContent = NewsService.getTickerText(allArticles);

      var sources    = [...new Set(allArticles.map(function(a){ return a.source; }))].length;
      var typeCounts = NewsService.getSourceStats(allArticles);
      if (statSources) statSources.textContent = sources;
      if (statStories) statStories.textContent = allArticles.length;
      var elR = document.getElementById('statReddit');
      var elT = document.getElementById('statTelegram');
      if (elR) elR.textContent = typeCounts.reddit;
      if (elT) elT.textContent = typeCounts.telegram;
      if (statUpdated) statUpdated.textContent = new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'}) + ' UTC';

      if (mapInited && typeof MapService !== 'undefined') MapService.update(allArticles);
      if (statsVisible && typeof StatsService !== 'undefined') StatsService.update(allArticles);

      checkBreakingNotify(allArticles);

      var critical = allArticles.find(function(a){ return a.threat && a.threat.level==='CRITICAL' && !seenBreaking.has(a.title+'_b'); });
      if (critical) { seenBreaking.add(critical.title+'_b'); showBreakingBanner(critical); }

      setTimeout(function() {
        if (filteredArticles.length > 0) {
          var firstCard = newsFeed && newsFeed.querySelector('[data-idx="0"]');
          if (firstCard) playArticle(filteredArticles[0], 0, firstCard);
        }
      }, 800);

      showToast('Loaded ' + allArticles.length + ' stories — RSS · Reddit ' + typeCounts.reddit + ' · Telegram ' + typeCounts.telegram);

    } catch(err) {
      showToast('Error loading news. Check your connection.', 5000);
      console.error('[App] loadNews failed:', err);
    }

    if (refreshBtn) { refreshBtn.textContent='Refresh'; refreshBtn.disabled=false; }
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = setTimeout(loadNews, REFRESH_MS);
  }

  if (refreshBtn) refreshBtn.addEventListener('click', function(){ clearTimeout(autoRefreshTimer); loadNews(); });

  await loadNews();

})();
