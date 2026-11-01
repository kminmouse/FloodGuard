# FloodGuard — 공공데이터 기반 도시 침수 위험 분석

서울 지역 하천 수위(한강홍수통제소)와 강수량(기상청 초단기실황)을 결합해 관측소별 침수 위험 점수를 계산하고, 슬라이더로 조건을 바꿔 위험도 변화를 확인하는 정적 웹앱입니다.
점수는 **입력 데이터와 가중치에 기반한 평가 모델**이며 실제 침수 발생을 예측하지 않습니다. 침수 이력 데이터는 아직 연동하지 않았고, 이 항목은 점수 계산에서 제외(가중치 재정규화)됩니다.

## 데이터 구분
- 화면 상단 배지: `실제 API 데이터`(data/live.json) / `데모 데이터`(data/sampleData.json, 수위·강수 값은 가상)
- 누적 강수량은 수집 시점별 1시간 강수량을 합산한 근사값입니다.

## 로컬 실행
ES 모듈을 쓰므로 파일을 더블클릭하지 말고 서버로 여세요: `python -m http.server 8000` → http://localhost:8000

## 키 관리와 배포 (GitHub Pages)
브라우저에서 API를 직접 부르면 키가 공개되므로, GitHub Actions가 서버 쪽에서 호출해 `data/live.json`을 갱신합니다.
1. 저장소 Settings → Secrets and variables → Actions → `HRFCO_KEY`, `DATA_GO_KR_KEY` 등록
2. Settings → Pages → Deploy from a branch → main / (root)
3. Actions 탭 → collect → Run workflow 로 수동 실행해 live.json 생성 확인
4. 지도: Kakao Developers에서 JavaScript 키 발급 후 플랫폼에 `https://아이디.github.io` 등록, `js/config.js`에 입력
