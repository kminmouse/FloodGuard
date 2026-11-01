import { evaluate, ctxOf } from './riskCalculator.js';
// 실제 수집 데이터(live.json) 우선, 없으면 데모(sampleData.json), 둘 다 실패하면 localStorage 캐시
export async function load() {
  for (const [url, mode] of [['data/live.json', 'live'], ['data/sampleData.json', 'demo']]) {
    try {
      const r = await fetch(url + '?t=' + Math.floor(Date.now() / 6e5));
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.stations?.length) continue;
      const res = { ...d, mode };
      try { localStorage.setItem('fg_last', JSON.stringify(res)); } catch {}
      return res;
    } catch {}
  }
  try { const c = localStorage.getItem('fg_last'); if (c) return { ...JSON.parse(c), cached: true }; } catch {}
  return null;
}
export function shell(active) {
  document.body.insertAdjacentHTML('afterbegin', `<nav><b>🌊 FloodGuard</b>${[['index.html', '대시보드'], ['map.html', '위험 지도'], ['analysis.html', '분석·시뮬레이션']].map(([h, t]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('')}</nav>`);
}
export const badge = d => !d ? '<span class="badge demo">데이터 없음</span>'
  : d.mode === 'live' ? `<span class="badge live">실제 API 데이터 · 수집 ${d.generatedAt}${d.cached ? ' (캐시)' : ''}</span>`
  : `<span class="badge demo">데모 데이터 · 실제 API 아님${d.cached ? ' (캐시)' : ''}</span>`;
export function rows(d) {
  const ctx = ctxOf(d.stations);
  return d.stations.map(s => ({ ...s, ...evaluate(s, ctx) })).filter(r => r.score != null).sort((a, b) => b.score - a.score);
}
export const lvTag = l => `<span class="lv" style="background:${l.c}">${l.n}</span>`;
