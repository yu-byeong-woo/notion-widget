# Graduation Credit Tracker (Notion Embed)

노션 공식 API와 실시간으로 연동되는 **투명 배경(자동 다크/라이트 모드)** 졸업 학점 트래커 대시보드입니다. Vercel에 배포해 노션 페이지에 `/임베드`로 바로 삽입할 수 있습니다.

## 주요 기능

- **투명 배경 & 자동 다크/라이트 모드**: `html, body` 배경이 완전 투명(`transparent`)으로 설정되어 노션의 다크/라이트 배경이 그대로 비치며, OS/노션 테마(`prefers-color-scheme`)에 따라 자동으로 스타일이 전환됩니다.
  - 필요 시 URL 쿼리로 테마를 고정할 수 있습니다: `?theme=dark` 또는 `?theme=light`
- **실시간 노션 API 연동 (`/api/credits`)**: Vercel Serverless Function이 CORS 문제 없이 노션 데이터베이스를 조회하고, 100개 이상의 과목도 페이지네이션으로 모두 불러옵니다.
- **자동 학점 계산**: 졸업 기준 학점 `136` 고정, `수강완료` / `수강중` / `남은 학점(136 - 수강완료)` / 진행률(%) 자동 집계.
- **즉시 탭 필터링**: `[전체]`, `[전공필수]`, `[전공선택]`, `[교양]` 탭 클릭 시 클라이언트에서 즉시 필터링.
- **0.01초 즉시 렌더링 (`localStorage` SWR)**: 마지막 데이터를 브라우저 `localStorage`에 캐싱해 빈 화면 없이 즉시 표시하고, 백그라운드에서 `/api/credits`를 호출해 최신 데이터로 갱신합니다.

## 노션 데이터베이스 속성 기준

| 속성명 | 속성 타입 | 허용 값 / 예시 |
| --- | --- | --- |
| `과목명` | 제목 (`Title`) | `자료구조와 알고리즘` |
| `학점` | 숫자 (`Number`) | `2`, `3` |
| `상태` | 선택 (`Select`) 또는 상태 (`Status`) | `수강완료`, `수강중` |
| `이수구분` | 선택 (`Select`) | `전공필수`, `전공선택`, `교양` |
| `학기` | 선택 (`Select`) | `2학년 2학기` |

## Vercel 배포 및 연동 방법

1. **노션 통합(Integration) 생성**
   - [Notion My Integrations](https://www.notion.so/my-integrations)에서 새 통합을 만들고 시크릿 키(`NOTION_API_KEY`)를 복사합니다.
   - 학점 데이터베이스 페이지 우측 상단 `⋯` → `연결(Connections)`에서 방금 만든 통합을 추가합니다.
   - 데이터베이스 URL에서 32자리 ID(`NOTION_DATABASE_ID`)를 복사합니다.
2. **Vercel 배포**
   - 이 프로젝트를 GitHub에 올린 뒤 Vercel에서 Import하거나 `vercel` CLI로 배포합니다.
   - Vercel Project Settings → **Environment Variables**에 아래 2개를 등록하고 Redeploy합니다:
     - `NOTION_API_KEY`
     - `NOTION_DATABASE_ID`
3. **노션에 임베드**
   - 노션 페이지에서 `/embed` 입력 후 배포된 Vercel URL(예: `https://your-project.vercel.app`)을 붙여넣습니다.

## 로컬 미리보기

```bash
npm run preview
```

- 다크 모드 데모: `http://localhost:3000/?demo=1&theme=dark`
- 라이트 모드 데모: `http://localhost:3000/?demo=1&theme=light`
