# Graduation Credit Tracker (Notion Embed)

노션 공식 API와 실시간으로 연동되는 **투명 배경(자동 다크/라이트 모드)** 졸업 학점 트래커 대시보드입니다. 각자 본인의 Vercel 계정에 배포해 노션 페이지에 `/embed`로 바로 삽입할 수 있습니다.

## 내 노션에 바로 배포하기 (1분 완성)

아래 버튼을 누르면 본인의 GitHub 및 Vercel 계정에 독립적으로 복제 배포됩니다. (다른 사람과 데이터가 절대 섞이지 않습니다.)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyu-byeong-woo%2Fnotion-widget&env=NOTION_API_KEY,NOTION_DATABASE_ID&envDescription=Notion%20Integration%20Secret%20Key%20%EB%B0%8F%20%ED%95%99%EC%A0%90%20DB%20ID%EB%A5%BC%20%EC%9E%85%EB%A0%A5%ED%95%98%EC%84%B8%EC%9A%94.&project-name=notion-credit-widget&repository-name=notion-widget)

> **중요**: 노션 임베드(`/embed`) 안에서 Vercel 로그인 화면이 뜨지 않도록 배포 후 Vercel Project Settings → **Deployment Protection**에서 **Vercel Authentication**을 꺼주세요.

## 주요 기능

- **투명 배경 & 자동 다크/라이트 모드**: `html, body` 배경이 완전 투명(`transparent`)으로 설정되어 노션의 다크/라이트 배경이 그대로 비치며, OS/노션 테마(`prefers-color-scheme`)에 따라 자동으로 스타일이 전환됩니다. (`?theme=dark` 또는 `?theme=light`로 고정 가능)
- **실시간 노션 API 연동 (`/api/credits`)**: Vercel Serverless Function으로 CORS 문제 없이 노션 DB 조회 및 과목 추가(`GET`/`POST`)를 처리합니다.
- **자동 학점 계산 & 정렬**: 졸업 기준 학점 `136` 고정, `수강완료` / `수강중` / `남은 학점` / 진행률(%) 자동 집계. 리스트는 **학기순 → 이수구분(전공필수, 전공선택, 교양, 일반) → 상태 → 학점순**으로 정렬됩니다.
- **위젯 내 바로 과목 추가**: `+ 과목 추가` 모달에서 즉시 과목을 등록할 수 있으며, 선택적으로 `NOTION_SUBJECT_DATABASE_ID`를 설정하면 시간표·강의 노트 DB에도 함께 등록 및 연결됩니다.
- **0.01초 즉시 렌더링 (`localStorage` SWR)**: 마지막 데이터를 브라우저에 캐싱해 빈 화면 없이 즉시 표시하고 백그라운드에서 최신 데이터로 갱신합니다.

## 노션 데이터베이스 속성 기준

| 속성명 | 속성 타입 | 허용 값 / 예시 |
| --- | --- | --- |
| `과목명` | 제목 (`Title`) | `자료구조와 알고리즘` |
| `학점` | 숫자 (`Number`) 또는 선택 (`Select`) | `1`, `2`, `3` |
| `상태` | 선택 (`Select`) 또는 상태 (`Status`) | `수강완료`, `수강중` |
| `이수구분` 또는 `구분` | 선택 (`Select`) | `전공필수`, `전공선택`, `교양필수`, `교양선택`, `일반선택` |
| `학기` 또는 `이수 학기` | 선택 (`Select`) | `1학년 1학기` ~ `4학년 2학기` |

## 연동 방법

1. **노션 통합(Integration) 생성**
   - [Notion My Integrations](https://www.notion.so/my-integrations)에서 새 통합을 만들고 시크릿 키(`NOTION_API_KEY`)를 복사합니다.
   - 학점 데이터베이스 페이지 우측 상단 `⋯` → `연결(Connections)`에서 방금 만든 통합을 추가합니다.
   - 데이터베이스 URL에서 32자리 ID(`NOTION_DATABASE_ID`)를 복사합니다.
2. **Vercel 배포 & 환경변수 설정**
   - 상단 **Deploy with Vercel** 버튼으로 배포하면서 `NOTION_API_KEY`, `NOTION_DATABASE_ID`를 입력합니다.
   - *(선택)* 시간표/강의 노트(`Subject` DB)에도 함께 연동하려면 `NOTION_SUBJECT_DATABASE_ID` 환경변수를 추가합니다.
3. **노션에 임베드**
   - 노션 페이지에서 `/embed` 입력 후 본인의 Vercel 배포 URL을 붙여넣습니다.

## 로컬 미리보기

```bash
npm run preview
```

- 다크 모드 데모: `http://localhost:3000/?demo=1&theme=dark`
- 라이트 모드 데모: `http://localhost:3000/?demo=1&theme=light`
