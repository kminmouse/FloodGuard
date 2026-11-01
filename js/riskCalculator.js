// 가중치 기반 침수 위험도 평가 모델 (초기 실험용 설정, 실제 침수 예측 모델이 아님)
export const WEIGHTS = { rain: .35, level: .30, history: .20, terrain: .15 };
export const LEVELS = [{ n: '안전', c: '#22c55e', min: 0 }, { n: '관심', c: '#eab308', min: 25 }, { n: '주의', c: '#f97316', min: 50 }, { n: '위험', c: '#ef4444', min: 75 }];
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
export const levelOf = s => [...LEVELS].reverse().find(l => s >= l.min);
// 가정값: 시간당 80mm, 누적 300mm를 100점으로 정규화, 지속시간 12h까지 최대 20% 가중
export function rainScore(h, cum, dur = 3) {
  const base = .6 * clamp(h / 80 * 100) + .4 * clamp(cum / 300 * 100);
  return clamp(base * (.8 + .2 * Math.min(dur, 12) / 12));
}
// 관측소별 관심/주의/경계/심각 수위를 25/50/75/100점에 대응, 구간은 선형 보간
export function levelScore(wl, t) {
  if (wl == null) return null;
  const pts = [[0, 0]];
  [['att', 25], ['wrn', 50], ['alm', 75], ['srs', 100]].forEach(([k, p]) => { if (t[k] != null) pts.push([t[k], p]); });
  if (pts.length < 2) return null;
  for (let i = 1; i < pts.length; i++) {
    const [a, pa] = pts[i - 1], [b, pb] = pts[i];
    if (wl <= b) return clamp(pa + (pb - pa) * (wl - a) / (b - a));
  }
  return 100;
}
// 관측소 표고(gdt)가 낮을수록 취약하다는 단순 가정(관측소 간 상대값)
export const terrainScore = (g, min, max) => g == null ? null : max === min ? 50 : 100 * (1 - (g - min) / (max - min));
// 점수가 없는 항목(예: 침수 이력 미연동)은 제외하고 가중치를 재정규화
export function total(p) {
  let s = 0, w = 0;
  for (const k in WEIGHTS) if (p[k] != null) { s += p[k] * WEIGHTS[k]; w += WEIGHTS[k]; }
  return w ? s / w : null;
}
export function ctxOf(sts) { const g = sts.map(s => s.gdt).filter(v => v != null); return { gmin: Math.min(...g), gmax: Math.max(...g) }; }
export function evaluate(st, ctx, ov = {}) {
  const h = ov.h ?? st.rain1h ?? 0, cum = ov.cum ?? st.rain24 ?? 0, dur = ov.dur ?? 3, wl = ov.wl ?? st.wl;
  const parts = { rain: rainScore(h, cum, dur), level: levelScore(wl, st.levels), history: null, terrain: terrainScore(st.gdt, ctx.gmin, ctx.gmax) };
  const score = total(parts);
  return { parts, score, lv: levelOf(score) };
}
