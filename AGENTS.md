# Notion Widget Project Rules (`notion-widget`)

이 문서는 새로운 채팅에서 이 프로젝트(`notion-widget` / Vercel: `notion-credit-widget`)에 **새 노션 임베드 위젯**을 추가할 때 반드시 따라야 하는 개발·보안·배포 규칙입니다.

---

## 1. 현재 프로젝트 구조

- **프론트엔드 (`public/`)**
  - `public/graduation-credits/` — 졸업 학점 트래커 (`/`, `/graduation-credits`)
  - `public/timetable/` — 대학 시간표 위젯 (`/timetable`)
  - `public/connect/index.html` — Notion OAuth 연동 및 개인별 암호화 임베드 링크(`?k=`) 발급 페이지 (`/connect`)
- **백엔드 API (`api/`)**
  - `api/_crypto.js` — AES-256-GCM 암호화/복호화 및 `extractWidgetKey(req)` 유틸 (`_` 접두사로 Vercel 함수 개수에 미포함)
  - `api/oauth.js` — Notion OAuth (`/api/oauth/start`, `/api/oauth/callback`, `/api/oauth/mint`)
  - `api/credits.js` — 졸업 학점 API (`/api/credits`)
  - `api/timetable.js` — 시간표 API (`/api/timetable`)
- **설정 및 로컬 서버**
  - `vercel.json` — 멀티 페이지 리라이트 및 `/api/(.*)` CORS 헤더
  - `scripts/dev-server.js` — 로컬 프리뷰 서버 (`npm run preview`)

---

## 2. 새 위젯 추가 시 필수 규칙

### ① 기존 위젯 충돌 방지 & 폴더 분리
- 기존 `graduation-credits`, `timetable`, `connect` 파일과 라우트를 절대 덮어쓰거나 깨뜨리지 않는다.
- 새 위젯 프론트엔드는 `public/<widget-name>/` (`index.html`, `styles.css`, `app.js`)에 독립 배치한다.
- 백엔드 API는 `api/<widget-name>.js`로 분리한다.
  - **Vercel Hobby 플랜 제한 주의:** `api/` 내 엔드포인트 파일(`_` 제외)은 프로젝트당 **최대 12개**까지 무료다. 12개에 가까워지면 기존 API 파일에 `?type=` 분기로 통합한다.

### ② 보안 및 멀티유저 `?k=` 필수 규칙 (중요)
- 모든 위젯 API는 `api/_crypto.js`의 `extractWidgetKey(req)`와 `decryptPayload(widgetKey)`를 사용해 `?k=` 파라미터를 **필수로 검증**한다.
- `?k=`가 없거나 복호화에 실패하면 **절대** 서버 환경변수(`NOTION_API_KEY`, `NOTION_DATABASE_ID` 등)로 폴백하지 않고 즉시 `401` (`WIDGET_KEY_REQUIRED` / `INVALID_WIDGET_KEY`)을 반환한다.
- 프론트엔드 `app.js`에서도:
  - URL에서 `k` 파라미터를 읽어 모든 `/api/<widget-name>` 호출에 `?k=...`를 포함한다.
  - `localStorage` 캐시 키에 `k`의 일부(예: 뒤 12자리)를 suffix로 붙여 사용자 간 캐시 충돌을 막는다.
  - `?demo=1`이 아닌데 `k`가 없으면 캐시를 읽거나 API를 호출하지 않고 `/connect` 연동 안내 배너를 띄운다.

### ③ `/connect` 온보딩 연동
- 새 위젯이 노션 DB를 사용한다면 `public/connect/index.html`에 해당 DB 선택 드롭다운과 생성된 임베드 URL 복사 칸을 추가하고, `api/oauth.js`의 `handleMint`에서 해당 위젯용 `?k=` 링크를 함께 발급한다.

### ④ 라우팅 및 UI/성능 기준
- `vercel.json`의 `rewrites`에 `/<widget-name>` 및 `/<widget-name>/` → `/<widget-name>/index.html`을 추가한다.
- 노션 임베드 환경에 맞춰 다크모드(`#191919` 배경 또는 투명 테마)와 반응형 레이아웃을 적용한다.
- `localStorage` 캐싱으로 0.01초 내 즉시 렌더링 후 백그라운드에서 API를 호출해 최신 상태로 갱신한다.
- `?demo=1` 쿼리로 노션 연결 없이도 샘플 데이터 미리보기가 가능하도록 유지한다.

---

## 3. 작업 완료 후 자동 검증 · GitHub 푸시 · Vercel 배포 절차

새 위젯 구현이나 수정이 끝나면 아래 순서를 끝까지 실행하고 결과를 보고한다.

1. **문법 및 설정 검사**
   - 수정/추가된 모든 `.js` 파일에 `node --check` 실행
   - `vercel.json` JSON 유효성 파싱 검사
2. **GitHub 커밋 & 푸시**
   - `git add` → `git commit` → `git push origin main` (`https://github.com/yu-byeong-woo/notion-widget.git`)
3. **Vercel 프로덕션 배포**
   - `npx --yes vercel --prod --yes` 실행 (프로젝트: `notion-credit-widget`, 기본 도메인: `https://notion-credit-widget-phi.vercel.app`)
4. **라이브 검증**
   - 새 위젯 페이지(`/<widget-name>`)가 `200 OK`인지 확인
   - 새 API(`/api/<widget-name>`)가 `?k=` 없이 호출 시 `401`로 차단되는지 확인
   - 기존 위젯(`/`, `/timetable`, `/connect`)도 모두 `200 OK`로 정상 유지되는지 확인
