/* ================================================
   newsService.js  —  RSS / Reddit / Telegram fetcher
   ================================================
   CORS Proxies (all free, no API key needed):
     1. allorigins.win  → returns raw RSS/XML text
     2. corsproxy.io    → fallback
     3. rss2json.com    → last resort (JSON parse path)
   Parsing: native DOMParser — zero external deps.
   ================================================ */

const NewsService = (() => {

  /* ---- CORS Proxy chain (tried in order) ---- */
  // rss2json first — most reliable; allorigins/corsproxy as XML fallbacks
  const PROXIES = [
    url => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=40`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  // Which proxy index returns JSON (not XML)
  const JSON_PROXY_IDX = new Set([0]);
  const PROXY_NAMES    = ['rss2json','allorigins','corsproxy'];
  // Timeout per proxy attempt (ms)
  const PROXY_TIMEOUTS = [8000, 5000, 5000];

  /* ---- All Sources ---- */
  const SOURCES = [
    /* ── RSS ── */
    { id:'al_jazeera',    type:'rss',      name:'Al Jazeera',             color:'#ffaa00', primaryRegion:'MIDDLE_EAST',  url:'https://www.aljazeera.com/xml/rss/all.xml' },
    { id:'bbc_world',     type:'rss',      name:'BBC World',              color:'#bb1122', primaryRegion:'WORLD',        url:'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { id:'guardian',      type:'rss',      name:'The Guardian',           color:'#005689', primaryRegion:'WORLD',        url:'https://www.theguardian.com/world/rss' },
    { id:'france24',      type:'rss',      name:'France 24',              color:'#cc0033', primaryRegion:'WORLD',        url:'https://www.france24.com/en/rss' },
    { id:'meye',          type:'rss',      name:'Middle East Eye',        color:'#009688', primaryRegion:'MIDDLE_EAST',  url:'https://www.middleeasteye.net/rss' },
    { id:'jpost',         type:'rss',      name:'Jerusalem Post',         color:'#1565c0', primaryRegion:'ISRAEL',       url:'https://www.jpost.com/rss/rssfeedsfrontpage.aspx' },
    { id:'dawn_pk',       type:'rss',      name:'Dawn (Pakistan)',        color:'#2e7d32', primaryRegion:'PAKISTAN',     url:'https://www.dawn.com/feeds/home' },
    { id:'tolo_af',       type:'rss',      name:'TOLOnews Afghanistan',   color:'#6a1b9a', primaryRegion:'AFGHANISTAN',  url:'https://tolonews.com/feed' },
    { id:'defenseone',    type:'rss',      name:'Defense One',            color:'#546e7a', primaryRegion:'USA',          url:'https://www.defenseone.com/rss/all' },
    { id:'ukrinform',     type:'rss',      name:'Ukrinform',              color:'#fdd835', primaryRegion:'UKRAINE',      url:'https://www.ukrinform.net/rss/block-worldnews' },
    { id:'alaraby',       type:'rss',      name:'The New Arab',           color:'#b71c1c', primaryRegion:'MIDDLE_EAST',  url:'https://www.newarab.com/rss.xml' },
    /* ── Reddit (free public RSS) ── */
    { id:'r_worldnews',   type:'reddit',   name:'r/worldnews',            color:'#ff4500', primaryRegion:'WORLD',        url:'https://www.reddit.com/r/worldnews/.rss' },
    { id:'r_ukraine',     type:'reddit',   name:'r/ukraine',              color:'#ffd600', primaryRegion:'UKRAINE',      url:'https://www.reddit.com/r/ukraine/.rss' },
    { id:'r_uawar',       type:'reddit',   name:'r/UkraineWarVideoReport',color:'#e65100', primaryRegion:'UKRAINE',      url:'https://www.reddit.com/r/UkraineWarVideoReport/.rss' },
    { id:'r_israel',      type:'reddit',   name:'r/IsraelPalestine',      color:'#1565c0', primaryRegion:'ISRAEL',       url:'https://www.reddit.com/r/IsraelPalestine/.rss' },
    { id:'r_mideast',     type:'reddit',   name:'r/MiddleEast',           color:'#bf360c', primaryRegion:'MIDDLE_EAST',  url:'https://www.reddit.com/r/MiddleEast/.rss' },
    { id:'r_iran',        type:'reddit',   name:'r/iran',                 color:'#00695c', primaryRegion:'IRAN',         url:'https://www.reddit.com/r/iran/.rss' },
    { id:'r_pakistan',    type:'reddit',   name:'r/pakistan',             color:'#2e7d32', primaryRegion:'PAKISTAN',     url:'https://www.reddit.com/r/pakistan/.rss' },
    { id:'r_afghanistan', type:'reddit',   name:'r/afghanistan',          color:'#6a1b9a', primaryRegion:'AFGHANISTAN',  url:'https://www.reddit.com/r/afghanistan/.rss' },
    /* ── Telegram via RSSHub public instance ── */
    { id:'tg_wartrans',   type:'telegram', name:'War Translated (TG)',    color:'#29b6f6', primaryRegion:'MIDDLE_EAST',  url:'https://rsshub.app/telegram/channel/wartranslated' },
    { id:'tg_milland',    type:'telegram', name:'Military Land (TG)',     color:'#26c6da', primaryRegion:'UKRAINE',      url:'https://rsshub.app/telegram/channel/militaryland' },
    { id:'tg_intellslava',type:'telegram', name:'Intel Slava (TG)',       color:'#00bcd4', primaryRegion:'UKRAINE',      url:'https://rsshub.app/telegram/channel/IntelSlava' },
    { id:'tg_osint_ua',   type:'telegram', name:'OSINT Ukraine (TG)',     color:'#0288d1', primaryRegion:'UKRAINE',      url:'https://rsshub.app/telegram/channel/osint_ukraine_en' }
  ];

  /* ---- Region keyword map ---- */
  const REGION_KEYWORDS = {
    ISRAEL: [
      'israel','israeli','idf','gaza','hamas','netanyahu','tel aviv','west bank',
      'hezbollah','rafah','khan younis','jenin','gaza strip','palestin','idf',
      'mossad','iron dome','oct 7','october 7'
    ],
    IRAN: [
      'iran','iranian','tehran','khamenei','irgc','rouhani','nuclear deal',
      'jcpoa','persian gulf','hormuz','revolutionary guard','raisi','pezeshkian'
    ],
    UKRAINE: [
      'ukraine','ukrainian','russia','russian','putin','zelensky','kyiv','kremlin',
      'nato','crimea','donbas','kharkiv','mariupol','bakhmut','zaporizhzhia',
      'dnipro','kherson','odessa','lviv'
    ],
    PAKISTAN: [
      'pakistan','pakistani','islamabad','karachi','lahore','imran khan','sharif',
      'isi','balochistan','kashmir','ttp','tehrik','rawalpindi'
    ],
    AFGHANISTAN: [
      'afghanistan','afghan','kabul','taliban','kandahar','helmand',
      'isis-k','is-k','daesh','mazar','herat','nangarhar'
    ],
    USA: [
      'pentagon','us military','american troops','us forces','nato','trump',
      'biden','congress','us army','us navy','us air force','centcom','special forces',
      'us strike','american airstrike','washington','white house'
    ],
    MIDDLE_EAST: [
      'middle east','iraq','baghdad','syria','damascus','bashar','isis','isil',
      'daesh','yemen','houthi','saudi arabia','riyadh','jordan','lebanon',
      'beirut','qatar','doha','bahrain','kuwait','uae','abu dhabi','dubai',
      'oman','arab','shiite','sunni','militia','proxy war','persian'
    ],
    WORLD: []   // catch-all
  };

  /* ---- Conflict tag map ---- */
  const CONFLICT_TAGS = {
    ISRAEL:      ['🇮🇱 Israel', 'Gaza War', 'IDF'],
    IRAN:        ['🇮🇷 Iran', 'Nuclear', 'IRGC'],
    UKRAINE:     ['🇺🇦 Ukraine', 'Russia War', 'NATO'],
    PAKISTAN:    ['🇵🇰 Pakistan', 'TTP', 'Kashmir'],
    AFGHANISTAN: ['🇦🇫 Afghanistan', 'Taliban', 'ISIS-K'],
    USA:         ['🇺🇸 USA', 'Pentagon', 'NATO'],
    MIDDLE_EAST: ['🕌 Middle East', 'Houthi', 'ISIS'],
    WORLD:       ['🌍 World', 'Conflict', 'War']
  };

  /* ---- Region colors ---- */
  const REGION_COLORS = {
    ISRAEL:      '#1565c0',
    IRAN:        '#00695c',
    UKRAINE:     '#ffd600',
    PAKISTAN:    '#2e7d32',
    AFGHANISTAN: '#6a1b9a',
    USA:         '#c62828',
    MIDDLE_EAST: '#e65100',
    WORLD:       '#37474f'
  };

  /* ---- Guaranteed SVG fallback images per region (inline data URI — cannot fail) ---- */
  function _makeFallbackSVG(label, icon, color) {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200">',
      '<defs>',
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
      '<stop offset="0%" stop-color="' + color + '" stop-opacity=".45"/>',
      '<stop offset="100%" stop-color="#06060f" stop-opacity="1"/>',
      '</linearGradient>',
      '</defs>',
      '<rect width="640" height="200" fill="url(#bg)"/>',
      '<rect width="640" height="200" fill="none" stroke="' + color + '" stroke-width="1" stroke-opacity=".25"/>',
      '<text x="320" y="90" font-size="58" text-anchor="middle" font-family="Arial,sans-serif">' + icon + '</text>',
      '<text x="320" y="148" fill="' + color + '" font-size="20" font-weight="bold" ',
      'text-anchor="middle" font-family="Arial,sans-serif" letter-spacing="3" opacity=".92">' + label + '</text>',
      '<text x="320" y="174" fill="' + color + '" font-size="11" text-anchor="middle" ',
      'font-family="Arial,sans-serif" opacity=".5">WARWATCH AI</text>',
      '</svg>'
    ].join('');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const REGION_FALLBACK_IMGS = {
    ISRAEL:      _makeFallbackSVG('ISRAEL / GAZA',    '✡️',  '#ff2200'),
    IRAN:        _makeFallbackSVG('IRAN',             '🇮🇷', '#ff6b00'),
    UKRAINE:     _makeFallbackSVG('UKRAINE / RUSSIA', '🇺🇦', '#ffc107'),
    MIDDLE_EAST: _makeFallbackSVG('MIDDLE EAST',      '🕌',  '#ff8800'),
    AFGHANISTAN: _makeFallbackSVG('AFGHANISTAN',      '🇦🇫', '#00c8ff'),
    PAKISTAN:    _makeFallbackSVG('PAKISTAN',         '🇵🇰', '#0095ff'),
    USA:         _makeFallbackSVG('USA / NATO',       '🇺🇸', '#44aaff'),
    WORLD:       _makeFallbackSVG('GLOBAL CONFLICT',  '🌍',  '#aa44ff'),
  };

  /* ----------------------------------------
     tagRegion(text) → region string
  ----------------------------------------- */
  function tagRegion(title, desc) {
    const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
    for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
      if (region === 'WORLD') continue;
      for (const kw of keywords) {
        if (text.includes(kw)) return region;
      }
    }
    return 'WORLD';
  }

  /* ----------------------------------------
     isWarRelated — broadened keyword list
  ----------------------------------------- */
  const WAR_TERMS = [
    'war','attack','strike','bomb','missile','kill','dead','death','casualties',
    'troop','military','army','soldier','airstrike','conflict','battle','offensive',
    'ceasefire','siege','occupation','invasion','rebel','terror','explosion',
    'weapon','drone','navy','artillery','ambush','massacre','genocide','sanction',
    'nuclear','hostage','refugee','displaced','humanitarian','crisis',
    'iran','israel','ukraine','russia','hamas','hezbollah','houthi',
    'taliban','isis','daesh','ttp','irgc','idf','nato','pentagon',
    'middle east','gaza','kabul','kyiv','tehran','islamabad','afghanistan',
    'frontline','shelling','rocket','intercept','deploy','withdrawal',
    'militant','insurgent','coup','captured','liberated','occupied',
    'baghdad','damascus','beirut','pakistan','forces','combat','airforce'
  ];

  /* primaryRegion bypass: articles from region-specific sources always pass */
  const REGION_SPECIFIC = ['ISRAEL','IRAN','UKRAINE','PAKISTAN','AFGHANISTAN','USA','MIDDLE_EAST'];

  function isWarRelated(title, desc, primaryRegion) {
    if (primaryRegion && REGION_SPECIFIC.includes(primaryRegion)) return true;
    const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
    return WAR_TERMS.some(t => text.includes(t));
  }

  /* ----------------------------------------
     stripHtml(str) — remove tags
  ----------------------------------------- */
  function stripHtml(str) {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
              .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
              .replace(/\n+/g,' ').trim();
  }

  /* ----------------------------------------
     timeAgo(dateStr)
  ----------------------------------------- */
  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60)   return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  /* ----------------------------------------
     aiSummarize
  ----------------------------------------- */
  function aiSummarize(article) {
    const ctxMap = {
      ISRAEL:      'Amid the ongoing Israel-Gaza conflict,',
      IRAN:        'In a development related to Iran\'s regional posture,',
      UKRAINE:     'As the Russia-Ukraine war continues,',
      PAKISTAN:    'In Pakistan, amid cross-border tensions,',
      AFGHANISTAN: 'In Taliban-controlled Afghanistan,',
      USA:         'The United States, with its global military presence,',
      MIDDLE_EAST: 'Across the volatile Middle East region,',
      WORLD:       'In a significant global development,'
    };
    const ctx  = ctxMap[article.region] || 'In a recent development,';
    const desc = article.description;
    if (!desc || desc.length < 30) {
      return `${ctx} ${article.title}. Analysts are closely monitoring the situation for further escalation or diplomatic developments. No further details have been confirmed at this time.`;
    }
    // Split on sentence boundaries, filter out empty/short fragments
    const sentences = desc
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);
    const body = sentences.slice(0, 6).join(' ');
    const closing = sentences.length < 3
      ? ' Authorities and international observers are closely watching for further developments.'
      : '';
    return `${ctx} ${body}${closing}`;
  }

  /* ----------------------------------------
     Source-type icons
  ----------------------------------------- */
  const TYPE_ICON = { rss:'📡', reddit:'🟠', telegram:'✈️' };

  /* ========================================
     XML RSS/Atom parser — no external deps
  ========================================= */
  function parseXML(xmlText, source) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML parse error');

    const isAtom = doc.querySelectorAll('entry').length > 0;
    const items  = isAtom
      ? [...doc.querySelectorAll('entry')]
      : [...doc.querySelectorAll('item')];

    const articles = [];
    for (let i = 0; i < items.length; i++) {
      const el  = items[i];
      const get = tag => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

      const title = get('title');
      if (!title) continue;

      const rawDate = get('pubDate') || get('published') || get('updated') || new Date().toISOString();

      // Link — RSS uses <link>, Atom uses <link href="">
      let link = get('link');
      if (!link || link === '') {
        link = el.getElementsByTagName('link')[0]?.getAttribute('href') || '#';
      }

      const desc = stripHtml(
        get('description') || get('summary') || get('content') || ''
      ).slice(0, 500);

      // Thumbnail — try every common RSS/Atom image field
      let thumb = null;

      // 1. media:thumbnail (namespace-safe wildcard)
      const nsMT = el.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail');
      if (nsMT.length) thumb = nsMT[0].getAttribute('url');

      // 2. media:content with medium=image
      if (!thumb) {
        const nsMC = el.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content');
        for (let n = 0; n < nsMC.length; n++) {
          const u = nsMC[n].getAttribute('url');
          const m = nsMC[n].getAttribute('medium');
          if (u && (!m || m === 'image')) { thumb = u; break; }
        }
      }

      // 3. <enclosure type="image/..."> or any enclosure
      if (!thumb) {
        const encs = el.getElementsByTagName('enclosure');
        for (let n = 0; n < encs.length; n++) {
          const u = encs[n].getAttribute('url');
          const t = encs[n].getAttribute('type') || '';
          if (u && (t.startsWith('image') || !t)) { thumb = u; break; }
        }
      }

      // 4. <image><url> child of item
      if (!thumb) {
        const imgEl = el.getElementsByTagName('image')[0];
        if (imgEl) thumb = imgEl.getElementsByTagName('url')[0]?.textContent?.trim() || null;
      }

      // 5. First <img src> inside description / content:encoded CDATA
      if (!thumb) {
        const nsContent = el.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded');
        const rawHtml = (nsContent[0] || el.getElementsByTagName('encoded')[0])?.textContent ||
                        el.getElementsByTagName('description')[0]?.textContent || '';
        const imgM = rawHtml.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i)
                  || rawHtml.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/i);
        if (imgM) thumb = imgM[1] || imgM[0];
      }

      // Clean up relative/protocol-less URLs
      if (thumb && thumb.startsWith('//')) thumb = 'https:' + thumb;
      if (thumb && !thumb.startsWith('http'))  thumb = null;

      // Reddit: extract real outbound link + thumbnail from CDATA description
      if (source.type === 'reddit') {
        const raw = el.getElementsByTagName('description')[0]?.textContent || '';
        const lm  = raw.match(/href="(https?:\/\/(?!www\.reddit\.com)[^"]+)"/);
        if (lm) link = lm[1];
        if (!thumb) {
          // Use any image that is NOT from Reddit's own CDN (those require auth tokens)
          const im = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (im && im[1] && !im[1].includes('external-preview.redd.it') && !im[1].includes('reddit.com'))
            thumb = im[1];
          // Fallback: any direct image URL in the description
          const pm = raw.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/i);
          if (!thumb && pm && !pm[0].includes('reddit.com')) thumb = pm[0];
        }
      }

      if (!isWarRelated(title, desc, source.primaryRegion)) continue;

      const region = tagRegion(title, desc);
      const fr     = (region === 'WORLD' && source.primaryRegion !== 'WORLD')
                     ? source.primaryRegion : region;

      const a = {
        id:           `${source.id}_${i}_${Date.now()}`,
        title,
        description:  desc,
        link,
        pubDate:      rawDate,
        timeAgo:      timeAgo(rawDate),
        thumbnail:    thumb,
        fallbackThumb: REGION_FALLBACK_IMGS[fr] || REGION_FALLBACK_IMGS['WORLD'],
        source:       source.name,
        sourceType:   source.type,
        sourceIcon:   TYPE_ICON[source.type] || '📡',
        sourceColor:  source.color,
        region:       fr,
        regionColor:  REGION_COLORS[fr] || '#ff2200',
        tags:         CONFLICT_TAGS[fr] || [],
        isBreaking:   (Date.now() - new Date(rawDate).getTime()) < 3600000,
      };
      a.aiSummary = aiSummarize(a);
      articles.push(a);
    }
    return articles;
  }

  /* ========================================
     fetchWithTimeout — manual timeout shim
  ========================================= */
  function fetchWithTimeout(url, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      fetch(url)
        .then(r  => { clearTimeout(timer); resolve(r); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  /* ========================================
     fetchSource — proxy fallback chain
  ========================================= */
  async function fetchSource(source) {
    for (let pi = 0; pi < PROXIES.length; pi++) {
      const proxyUrl = PROXIES[pi](source.url);
      try {
        const resp = await fetchWithTimeout(proxyUrl, PROXY_TIMEOUTS[pi]);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();

        /* -- rss2json returns JSON -- */
        if (JSON_PROXY_IDX.has(pi)) {
          let data;
          try { data = JSON.parse(text); } catch(e) { throw new Error('JSON parse fail'); }
          if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('rss2json empty');
          return data.items
            .filter(i => i.title && isWarRelated(i.title, i.description, source.primaryRegion))
            .map((item, idx) => {
              const title = stripHtml(item.title);
              const desc  = stripHtml(item.description || item.content || '').slice(0, 11500);
              const region = tagRegion(title, desc);
              const fr = (region === 'WORLD' && source.primaryRegion !== 'WORLD') ? source.primaryRegion : region;

              // rss2json provides thumbnail, enclosure, and sometimes media
              let thumb = item.thumbnail || null;
              if (!thumb && item.enclosure && item.enclosure.link) thumb = item.enclosure.link;
              if (!thumb && item.enclosure && item.enclosure.url)  thumb = item.enclosure.url;
              // Extract first img from raw description HTML
              if (!thumb) {
                const rawDesc = item.description || item.content || '';
                const imgM = rawDesc.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)/i);
                if (imgM) thumb = imgM[1];
              }
              if (thumb && thumb.startsWith('//')) thumb = 'https:' + thumb;
              if (thumb && !thumb.startsWith('http')) thumb = null;

              const a = {
                id: `${source.id}_${idx}_${Date.now()}`,
                title, description: desc,
                link:          item.link || '#',
                pubDate:       item.pubDate,
                timeAgo:       timeAgo(item.pubDate),
                thumbnail:     thumb,
                fallbackThumb: REGION_FALLBACK_IMGS[fr] || REGION_FALLBACK_IMGS['WORLD'],
                source:        source.name,
                sourceType:    source.type,
                sourceIcon:    TYPE_ICON[source.type] || '📡',
                sourceColor:   source.color,
                region: fr, regionColor: REGION_COLORS[fr] || '#ff2200',
                tags: CONFLICT_TAGS[fr] || [],
                isBreaking: (Date.now() - new Date(item.pubDate).getTime()) < 3600000,
              };
              a.aiSummary = aiSummarize(a);
              return a;
            });
        }

        /* -- Proxies 0 & 1 return raw XML -- */
        return parseXML(text, source);

      } catch (e) {
        console.warn(`[NewsService] ${source.name} proxy#${pi} (${PROXY_NAMES[pi]}): ${e.message}`);
      }
    }
    console.error(`[NewsService] ALL proxies failed for ${source.name}`);
    return [];
  }

  /* ----------------------------------------
     fetchAll() → Array<article> sorted by date
  ----------------------------------------- */
  async function fetchAll() {
    console.log(`[NewsService] Fetching ${SOURCES.length} sources…`);
    const results = await Promise.allSettled(SOURCES.map(fetchSource));
    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    console.log(`[NewsService] Raw articles: ${all.length}`);

    // De-duplicate by similar title
    const seen = new Set();
    const deduped = all.filter(a => {
      const key = a.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  }

  /* ----------------------------------------
     getTickerText(articles)
  ----------------------------------------- */
  function getTickerText(articles) {
    return articles
      .slice(0, 12)
      .map(a => `• [${a.region}] ${a.title}`)
      .join('   ');
  }

  /* ----------------------------------------
     getSourceStats(articles)
  ----------------------------------------- */
  function getSourceStats(articles) {
    const counts = { rss: 0, reddit: 0, telegram: 0 };
    articles.forEach(a => { if (counts[a.sourceType] !== undefined) counts[a.sourceType]++; });
    return counts;
  }

  /* ----------------------------------------
     scoreThreat(article) → { level, score }
     LOW / MEDIUM / HIGH / CRITICAL
  ----------------------------------------- */
  const THREAT_WEIGHTS = {
    CRITICAL: ['nuclear','nuke','chemical weapon','biological weapon','mass casualty','genocide',
               'world war','global war','missile launch','ballistic','warhead','catastroph','annihilat'],
    HIGH:     ['airstrike','air strike','bombing','explosion','blast','casualt','killed','dead','death',
               'offensive','invasion','troops advance','battle','frontline','siege','hostage','ceasefire broken',
               'escalat','retaliat','attack on','fired on','shelling','ground operation'],
    MEDIUM:   ['clashes','fighting','militant','gunfire','raid','strike','protest','unrest','warning',
               'sanction','threat','tensions','military exercise','border conflict','arrested'],
    LOW:      ['negotiat','ceasefire','peace talk','agreement','diplomatic','humanitarian','aid','relief',
               'withdraw','pullout','monitor','un resolution']
  };

  function scoreThreat(article) {
    const txt = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
    if (THREAT_WEIGHTS.CRITICAL.some(w => txt.includes(w))) return { level: 'CRITICAL', score: 4 };
    if (THREAT_WEIGHTS.HIGH.some(w => txt.includes(w)))     return { level: 'HIGH',     score: 3 };
    if (THREAT_WEIGHTS.MEDIUM.some(w => txt.includes(w)))   return { level: 'MEDIUM',   score: 2 };
    return { level: 'LOW', score: 1 };
  }

  // Attach threat to fetchAll output
  const _origFetchAll = fetchAll;
  async function fetchAllWithThreat() {
    const articles = await _origFetchAll();
    articles.forEach(a => { a.threat = scoreThreat(a); });
    return articles;
  }

  return { fetchAll: fetchAllWithThreat, getTickerText, getSourceStats, scoreThreat, REGION_COLORS, CONFLICT_TAGS };
})();

