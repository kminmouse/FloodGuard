// GitHub Actions에서 실행: API 키는 Secrets에서만 읽고, 결과를 data/live.json으로 저장한다.
import fs from 'node:fs';
const HK = process.env.HRFCO_KEY, SK = process.env.DATA_GO_KR_KEY, OUT = 'data/live.json';
if (!HK || !SK) { console.error('Secrets 누락: HRFCO_KEY, DATA_GO_KR_KEY'); process.exit(1); }
const dms = s => { const [d, m, x] = s.trim().split('-').map(Number); return d + m / 60 + x / 3600; };
const num = v => { const n = parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; };
const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u.replaceAll(HK, '***').replace(/serviceKey=[^&]+/, 'serviceKey=***')); return r.json(); };
// 기상청 격자(nx, ny) 변환 (Lambert Conformal Conic, 5km)
export function grid(lat, lon) {
  const D = Math.PI / 180, R = 6371.00877 / 5, s1 = 30 * D, s2 = 60 * D, ol = 126 * D, oa = 38 * D;
  let sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(Math.tan(Math.PI / 4 + s2 / 2) / Math.tan(Math.PI / 4 + s1 / 2));
  const sf = Math.pow(Math.tan(Math.PI / 4 + s1 / 2), sn) * Math.cos(s1) / sn;
  const ro = R * sf / Math.pow(Math.tan(Math.PI / 4 + oa / 2), sn), ra = R * sf / Math.pow(Math.tan(Math.PI / 4 + lat * D / 2), sn);
  let th = lon * D - ol; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + 43 + .5), ny: Math.floor(ro - ra * Math.cos(th) + 136 + .5) };
}
if (process.argv[1]?.endsWith('collect.mjs')) {
  const H = `https://api.hrfco.go.kr/${HK}`, p = n => String(n).padStart(2, '0');
  const k0 = new Date(Date.now() + 9 * 36e5 - 40 * 6e4); // 정시 자료 반영 지연을 고려해 40분 전 기준
  const bd = `${k0.getUTCFullYear()}${p(k0.getUTCMonth() + 1)}${p(k0.getUTCDate())}`, bt = p(k0.getUTCHours()) + '00';
  const key = SK.includes('%') ? SK : encodeURIComponent(SK);
  const info = (await j(`${H}/waterlevel/info.json`)).content.filter(o => o.addr?.includes('서울') && num(o.attwl) != null && num(o.srswl) != null);
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { stations: [] };
  const pm = Object.fromEntries(prev.stations.map(s => [s.code, s])), wx = {}, errors = [], stations = [];
  for (const o of info) {
    const s = { code: o.wlobscd, name: o.obsnm, lat: +dms(o.lat).toFixed(5), lon: +dms(o.lon).toFixed(5), gdt: num(o.gdt),
      levels: { att: num(o.attwl), wrn: num(o.wrnwl), alm: num(o.almwl), srs: num(o.srswl) }, wl: null, wlTime: null, rain1h: null, rain24: null, hist: pm[o.wlobscd]?.hist || [] };
    try { // 필드명(ymdhm, wl)은 응답 확인 후 필요하면 수정
      const d = (await j(`${H}/waterlevel/list/10M/${o.wlobscd}.json`)).content || [];
      const last = d.sort((a, b) => String(b.ymdhm).localeCompare(String(a.ymdhm))).find(x => num(x.wl) != null);
      if (last) { s.wl = num(last.wl); s.wlTime = last.ymdhm; }
    } catch (e) { errors.push(`수위 ${o.wlobscd}: ${e.message}`); }
    const g = grid(s.lat, s.lon), k = g.nx + ',' + g.ny;
    if (!(k in wx)) {
      try {
        const r = await j(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${key}&pageNo=1&numOfRows=20&dataType=JSON&base_date=${bd}&base_time=${bt}&nx=${g.nx}&ny=${g.ny}`);
        wx[k] = num(r.response.body.items.item.find(x => x.category === 'RN1')?.obsrValue);
      } catch (e) { wx[k] = null; errors.push(`기상 ${k}: ${e.message}`); }
    }
    s.rain1h = wx[k];
    const t = bd + bt; // 누적 강수량 = 수집 시점별 1시간 강수량 합산(최근 24회, 근사값)
    s.hist = [...s.hist.filter(h => h.t !== t), { t, r: s.rain1h }].slice(-24);
    s.rain24 = +s.hist.reduce((a, h) => a + (h.r || 0), 0).toFixed(1);
    stations.push(s);
  }
  if (!stations.some(s => s.wl != null || s.rain1h != null)) { console.error('수집 실패', errors.slice(0, 5)); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify({ source: 'live', generatedAt: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ') + ' KST', baseTime: bd + bt, stations, errors: errors.slice(0, 10) }, null, 1));
  console.log('stations', stations.length, 'errors', errors.length);
}
