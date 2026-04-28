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
- [x] 추적 위젯 `index.html` 에 삽입 완료
- [x] 로그인 없는 즉시 플레이 (사용자 익명 자동 식별)
- [x] 무료 플레이 (백엔드는 정보 저장 / 매치메이킹 한정)
- [ ] 자체 도메인 호스팅 (배포 시 등록)
- [ ] AI 코드 비율 ≥ 90 % 유지 (개발 중 점검)
- [ ] 즉시 로딩 (빌드 사이즈 / 첫 페인트 시간 모니터링)
