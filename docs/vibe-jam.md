# Pieter Levels 의 Vibe Coding Game Jam

> 출처: jam.pieter.com / vibej.am, Gamedev.js, @levelsio 트윗, Indie Hackers 정리

## 1. 개요

- **주최자**: Pieter Levels (@levelsio) — 인디해커, Nomad List · Photo AI 창업자
- **공식 명칭**: *Vibe Coding Game Jam* (해시태그 **#vibejam**)
- **시작 배경**: 2025년 2월, Levels 가 Cursor 로 약 3시간 만에 만든 멀티플레이어 비행 시뮬레이터 `fly.pieter.com` 이 바이럴되며 "vibe coding" 트렌드를 촉발 → 그 흐름을 게임 잼으로 즉흥 기획.

## 2. 회차별 일정

| 회차 | 시작 | 마감 | 제출 수 | 비고 |
| --- | --- | --- | --- | --- |
| 2025년 1회 | 2025-03-18 경 | 2025-03-25 | 약 1,170 작 | 7일 단기전 |
| 2026년 2회 (Cursor Vibe Jam 2026) | 2026-04-01 | 2026-05-01 13:37 UTC | 진행 중 | Cursor 가 다이아몬드 스폰서로 합류, 상금 2.3배 증액 |

## 3. 핵심 규칙 (2026 기준)

### 필수
- **AI 코드 비율 ≥ 90 %** — "Vibe coded" 정의: AI 어시스턴트를 주된 개발 도구로 사용. 사람은 의도와 방향만 가이드.
- **신규 게임만** — 잼 시작일 (2026-04-01) 이후에 새로 만들어진 작품만 인정.
- **1인 1작** — 출품 1편으로 제한.
- **웹 브라우저 전용** — 다운로드형 / 모바일 네이티브 앱은 불가.
- **즉시 플레이** — 로그인 / 회원가입 / 무거운 로딩 화면 금지. "거의 즉시" 게임 시작 가능해야 함.
- **무료** — 페이월·구독 없는 free-to-play.
- **자체 호스팅** — 본인 도메인 / 서브도메인에 게임 배포.
- **추적 위젯 의무 삽입** — 다음 스니펫이 페이지에 포함되어야 하며, 누락 시 실격.
  ```html
  <script async src="https://vibej.am/2026/widget.js"></script>
  ```
  > 본 프로젝트는 `client/index.html` 에 이미 삽입되어 있음.

### 권장
- **엔진**: 자유 선택. **Three.js** 가 공식적으로 권장됨.
- **멀티플레이**: 필수 아님. 다만 바이럴 사례 (`fly.pieter.com`) 가 모두 멀티플레이라는 점 참고.
- **입력**: 키보드/마우스 표준. 모바일 호환은 가산점.

## 4. 상금 / 스폰서

### 2025년 (총 $17,500)
- Gold $10,000 / Silver $5,000 / Bronze
- 스폰서: Bolt.new, CodeRabbit.ai, Lambda API

### 2026년 (총 $40,000)
- Gold $25,000 / Silver $10,000 / Bronze $5,000
- 다이아몬드: **Cursor**
- 골드: Bolt.new
- 실버: Glif, Tripo3D

## 5. 심사

- **2026년 심사위원**: @levelsio (주최), @s13k_ (수석), @timsoret, @nicolamanzini 등.
- **방식**: 주최자가 1차로 룰 위반(로딩 실패, 위젯 누락 등)을 걸러 약 500개로 압축 → 심사위원단 수작업 평가.
- **암묵적 평가축**:
  1. 재미 (playability)
  2. 창의성
  3. AI 활용 완성도
  4. 즉시 접근성·퍼포먼스
  5. 바이럴성 (소셜에서 공유될 만한가)

## 6. 2025년 화제작

| 작품 | 제작자 | 비고 |
| --- | --- | --- |
| The Great Taxi Assignment | Tomas Bencko | GTA풍 택시 시뮬, $10,000 수상 |
| Vibeware | Matt Gordon | 봇이 임무를 수행, $5,000 수상 |
| fly.pieter.com | Pieter Levels | 잼 자체의 영감이 된 멀티플레이 비행 시뮬 |

## 7. 공식 채널

- 사이트: https://jam.pieter.com → https://vibej.am
- 위젯: https://vibej.am/2026/widget.js
- 트위터: https://x.com/levelsio
- 해시태그: **#vibejam**

## 8. 본 프로젝트의 컴플라이언스 체크리스트

- [x] 웹 브라우저 단일 페이지 (Vite + React + Three.js)
- [x] 추적 위젯 `index.html` L18에 삽입 완료
- [x] 로그인 없는 즉시 플레이 — `getOrCreatePlayerId`로 익명 UUID 자동 발급, 닉/세이버 색만 입력
- [x] 무료 플레이 — Cloudflare Workers Free + DO Free + Pages Free, 페이월 없음
- [x] **자체 (서브)도메인 호스팅** — `https://chambara-duel.pages.dev` (Pages 본인 서브도메인, 잼 규칙 §3 "본인 도메인 / 서브도메인" 충족). 잼 마감까지 시간 남으면 사용자 커스텀 도메인 추가 가능 (P2)
- [x] **AI 코드 비율 ≥ 90 %** — 22 commits 전체 Phase 1~13(`shared/combat/` 룰 → `client/src/duel/` 렌더 + 입력 → `worker/` Cloudflare DO)을 Claude Code(Opus) 주도 작성. 사용자는 의도(잼 컨셉, 4 라운드 피드백, 시각/타격감 방향, 무기 위계)와 결정(IP 네이밍, 캐릭터 스코프, SFX/캐릭터 에셋 수집)만 가이드. 코드/리서치/문서 모두 AI 생성 — `docs/duel-implementation.md` §9 phase history가 진실 소스.
- [x] **즉시 로딩** — 라이브 측정(2026-04-29): Pages TTFB **71ms** / Total **81ms**, JS 번들 1.3MB raw / **gzip 388KB**, HTML 692B. `soldier.glb` 2.1MB는 `?demo=character` 라우트 한정 — 메인 `/` critical path 밖. modern broadband에서 첫 페인트 < 1s.
- [~] 모바일 sanity (P2, 잼 §3 권장이지 필수 아님 — 키보드/마우스가 표준): viewport meta `viewport-fit=cover` 설정, `client/src/styles/index.css`에 모바일 가드 CSS 추가 — `html { touch-action: manipulation }` 더블탭 zoom 차단, `body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none }` iOS rubber band/탭 하이라이트/드래그 충돌 회피, `input/textarea`만 user-select: text 유지. canvas는 기존 `touch-action: none` 유지. 메인 `/` 입력은 mouse 전용 — 터치 디바이스에선 합성 mouse 이벤트로 부분 작동 (slice OK, 우클릭 가드 long-press 합성, 더블탭 찌르기 가능). 디바이스 직접 검증은 사용자 작업 잔존.
