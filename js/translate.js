/* ================================================
   translate.js  —  LibreTranslate integration
   ================================================ */
'use strict';

const TranslateService = (() => {
  const ENDPOINTS = [
    'https://translate.fedilab.app',
    'https://libretranslate.de',
    'https://translate.terraprint.co',
    'https://libretranslate.com',
  ];

  /* Detect if text is likely non-English */
  function looksNonEnglish(text) {
    if (!text) return false;
    // Arabic / Urdu block: \u0600-\u06FF
    if (/[\u0600-\u06FF]/.test(text)) return true;
    // Cyrillic / Russian: \u0400-\u04FF
    if (/[\u0400-\u04FF]/.test(text)) return true;
    // Hebrew: \u0590-\u05FF
    if (/[\u0590-\u05FF]/.test(text)) return true;
    // CJK
    if (/[\u4E00-\u9FFF]/.test(text)) return true;
    // Persian digits / extended Arabic
    if (/[\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return true;
    return false;
  }

  /* Detect source language code (best-effort) */
  function detectLang(text) {
    if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return 'ar';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    if (/[\u0590-\u05FF]/.test(text)) return 'he';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    return 'auto';
  }

  async function tryEndpoint(endpoint, text, sourceLang, targetLang) {
    const res = await fetch(`${endpoint}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: sourceLang, target: targetLang, format: 'text' }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.translatedText || json.translated_text || null;
  }

  async function translate(text, targetLang = 'en') {
    if (!text || text.trim().length < 5) return text;
    const sourceLang = detectLang(text);

    // Don't translate if already English (heuristic)
    if (!looksNonEnglish(text) && sourceLang === 'auto') {
      return text;
    }

    for (const ep of ENDPOINTS) {
      try {
        const result = await tryEndpoint(ep, text, sourceLang, targetLang);
        if (result) return result;
      } catch (e) {
        console.warn(`TranslateService: ${ep} failed:`, e.message);
      }
    }
    throw new Error('All translation endpoints failed');
  }

  /* Translate article title + summary together */
  async function translateArticle(article) {
    const combined = `${article.title}\n\n${article.aiSummary || article.description || ''}`;
    const translated = await translate(combined);
    const parts = translated.split('\n\n');
    return {
      title: parts[0] || translated,
      body:  parts.slice(1).join('\n\n') || translated,
    };
  }

  return { translate, translateArticle, looksNonEnglish, detectLang };
})();
