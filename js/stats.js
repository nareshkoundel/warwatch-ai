/* ================================================
   stats.js  —  Chart.js statistics dashboard
   ================================================ */
'use strict';

const StatsService = (() => {
  let charts = {};
  let _debTimer = null;

  const REGION_COLORS_MAP = {
    ISRAEL:      'rgba(255,34,0,0.75)',
    IRAN:        'rgba(255,107,0,0.75)',
    UKRAINE:     'rgba(255,193,7,0.75)',
    MIDDLE_EAST: 'rgba(255,136,0,0.75)',
    AFGHANISTAN: 'rgba(0,200,255,0.75)',
    PAKISTAN:    'rgba(0,149,255,0.75)',
    USA:         'rgba(68,170,255,0.75)',
    WORLD:       'rgba(170,68,255,0.75)',
  };
  const THREAT_COLORS = {
    CRITICAL: 'rgba(255,34,0,0.85)',
    HIGH:     'rgba(255,107,0,0.75)',
    MEDIUM:   'rgba(255,193,7,0.70)',
    LOW:      'rgba(0,200,83,0.70)',
  };

  function destroyChart(id) {
    if (charts[id]) { try { charts[id].destroy(); } catch(e){} delete charts[id]; }
  }

  const CHART_DEFAULTS = {
    color: 'rgba(255,255,255,0.7)',
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
    }
  };

  function buildRegionChart(articles) {
    const counts = {};
    articles.forEach(a => { counts[a.region] = (counts[a.region] || 0) + 1; });
    const labels = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
    const data   = labels.map(l => counts[l]);
    const colors = labels.map(l => REGION_COLORS_MAP[l] || 'rgba(160,160,160,0.6)');

    if (charts.region) {
      charts.region.data.labels = labels;
      charts.region.data.datasets[0].data = data;
      charts.region.data.datasets[0].backgroundColor = colors;
      charts.region.update('none');
      return;
    }
    const ctx = document.getElementById('chartRegion');
    if (!ctx) return;
    charts.region = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Articles', data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false } },
        scales: {
          x: CHART_DEFAULTS.scales.x,
          y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        }
      }
    });
  }

  function buildThreatChart(articles) {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    articles.forEach(a => {
      const level = (a.threat && a.threat.level) ? a.threat.level : 'LOW';
      counts[level] = (counts[level] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const data   = labels.map(l => counts[l]);
    const colors = labels.map(l => THREAT_COLORS[l]);

    if (charts.threat) {
      charts.threat.data.datasets[0].data = data;
      charts.threat.update('none');
      return;
    }
    const ctx = document.getElementById('chartThreat');
    if (!ctx) return;
    charts.threat = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 400 },
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', font: {size:10}, padding: 10 } }
        }
      }
    });
  }

  function buildSourcesChart(articles) {
    const counts = {};
    articles.forEach(a => {
      const key = (a.sourceName || a.source || 'Unknown').substring(0,18);
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
    const labels = sorted.map(x => x[0]);
    const data   = sorted.map(x => x[1]);

    if (charts.sources) {
      charts.sources.data.labels = labels;
      charts.sources.data.datasets[0].data = data;
      charts.sources.update('none');
      return;
    }
    const ctx = document.getElementById('chartSources');
    if (!ctx) return;
    charts.sources = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Articles',
          data,
          backgroundColor: 'rgba(255,107,0,0.6)',
          borderColor: 'rgba(255,107,0,0.9)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false } },
        scales: CHART_DEFAULTS.scales,
      }
    });
  }

  function updateWidgets(articles) {
    const counts = {};
    articles.forEach(a => { counts[a.region] = (counts[a.region] || 0) + 1; });
    const topRegion = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    const critCount = articles.filter(a => a.threat && a.threat.level === 'CRITICAL').length;
    const breakCount = articles.filter(a => {
      const t = (a.title||'').toLowerCase();
      return t.includes('breaking') || t.includes('urgent') || t.includes('alert');
    }).length;

    const el = id => document.getElementById(id);
    if (el('sdTopVal'))      el('sdTopVal').textContent      = topRegion ? topRegion[0].replace('_',' ') : '—';
    if (el('sdTotalVal'))    el('sdTotalVal').textContent    = articles.length;
    if (el('sdCriticalVal')) el('sdCriticalVal').textContent = critCount;
    if (el('sdBreakingVal')) el('sdBreakingVal').textContent = breakCount;
    if (el('sdUpdated'))     el('sdUpdated').textContent     = 'Updated ' + new Date().toLocaleTimeString();
  }

  function update(articles) {
    if (!articles || !articles.length) return;
    clearTimeout(_debTimer);
    _debTimer = setTimeout(function() {
      try { buildRegionChart(articles);  } catch(e) { console.warn('Region chart:', e); }
      try { buildThreatChart(articles);  } catch(e) { console.warn('Threat chart:', e); }
      try { buildSourcesChart(articles); } catch(e) { console.warn('Sources chart:', e); }
      updateWidgets(articles);
    }, 120);
  }

  return { update };
})();
