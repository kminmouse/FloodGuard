// GitHub Actions에서 실행: API 키는 Secrets에서만 읽고, 결과를 data/live.json으로 저장한다.
import fs from 'node:fs';
const HK = process.env.HRFCO_KEY, SK = process.env.DATA_GO_KR_KEY, OUT = 'data/live.json';
if (!HK || !SK) { console.error('Secrets 누락: HRFCO_KEY, DATA_GO_KR_KEY'); process.exit(1); }
const dms = s => { const [d, m, x] = s.trim().split('-').map(Number); return d + m / 60 + x / 3600; };
const num = v => { const n = parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; };
const kt = ms => new Date(ms + 9 * 36e5).toISOString().slice(0, 16).replace(/[-T:]/g, ''); // KST yyyymmddhhmm
const GU = { 종로구: '110', 중구: '140', 용산구: '170', 성동구: '200', 광진구: '215', 동대문구: '230', 중랑구: '260', 성북구: '290', 강북구: '305', 도봉구: '320', 노원구: '350', 은평구: '380', 서대문구: '410', 마포구: '440', 양천구: '470', 강서구: '500', 구로구: '530', 금천구: '545', 영등포구: '560', 동작구: '590', 관악구: '620', 서초구: '650', 강남구: '680', 송파구: '710', 강동구: '740' };
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
  // 도시침수지도 침수심별 면적(km²) → 면적×대표 침수심으로 추정 침수량 산출(100년 빈도). 모든 값이 0인 구는 자료 없음(null)으로 처리
  const flood = {}; let floodMax = 0;
  try {
    const r = await j(`https://apis.data.go.kr/1480964/InquireAdmCtyFLService_v2/get-list_v2?serviceKey=${key}&pageNo=1&numOfRows=100&stdgCtpvCd=11&fldlvFreq=100&type=JSON`);
    const it = [].concat(r.response.body.items.item || []), W = [.25, .75, 1.5, 3.5, 5];
    for (const x of it) {
      const v = [x.floodAreaDepthLe05, x.floodAreaDepth0510, x.floodAreaDepth1020, x.floodAreaDepth2050, x.floodAreaDepthGt50].reduce((a, n, i) => a + (num(n) || 0) * W[i], 0);
      flood[x.stdgSggCd] = v > 0 ? +v.toFixed(3) : null;
    }
    floodMax = Math.max(0, ...Object.values(flood).filter(v => v != null));
  } catch (e) { errors.push('침수 통계: ' + e.message); }
  for (const o of info) {
    const s = {
      code: o.wlobscd, name: o.obsnm, lat: +dms(o.lat).toFixed(5), lon: +dms(o.lon).toFixed(5), gdt: num(o.gdt), addr: o.addr, etc: (o.etcaddr || '').trim(),
      levels: { att: num(o.attwl), wrn: num(o.wrnwl), alm: num(o.almwl), srs: num(o.srswl) }, wl: null, wlTime: null, wseries: [], rain1h: null, rain24: null, hist: pm[o.wlobscd]?.hist || []
    };
    try { // 필드명(ymdhm, wl)은 응답 확인 후 필요하면 수정
      let d = []; // 기간 지정 조회(최근 12시간)를 먼저 시도하고, 실패하거나 1건 이하면 기본 조회로 대체
      try { d = (await j(`${H}/waterlevel/list/10M/${o.wlobscd}/${kt(Date.now() - 12 * 36e5)}/${kt(Date.now())}.json`)).content || []; } catch { }
      if (!d.some(x => num(x.wl) != null)) d = (await j(`${H}/waterlevel/list/10M/${o.wlobscd}.json`)).content || []; // 범위 조회에 유효한 수위가 없으면 기본 조회로 대체
      const last = d.sort((a, b) => String(b.ymdhm).localeCompare(String(a.ymdhm))).find(x => num(x.wl) != null);
      if (last) { s.wl = num(last.wl); s.wlTime = last.ymdhm; } else errors.push(`수위 ${o.wlobscd}: 유효한 wl 없음(응답 ${d.length}건)`);
      s.wseries = d.slice(0, 72).map(x => ({ t: String(x.ymdhm), v: num(x.wl) })).filter(x => x.v != null); // 최신순
    } catch (e) { errors.push(`수위 ${o.wlobscd}: ${e.message}`); }
    s.gu = (`${o.addr} ${o.etcaddr || ''}`.match(/[가-힣]+구/) || [])[0] || null; s.floodVol = flood[GU[s.gu]] ?? null;
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
  fs.writeFileSync(OUT, JSON.stringify({ source: 'live', generatedAt: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ') + ' KST', baseTime: bd + bt, floodMax, stations, errors: errors.slice(0, 10) }, null, 1));
  console.log('stations', stations.length, 'errors', errors.length);
}
