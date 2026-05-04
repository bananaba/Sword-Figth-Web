# CLAUDE.md — Project Entry Map

**프로젝트**: Chambara Duel — Vibe Jam 2026 출품작. Nintendo Switch Sports의 *Chambara* 종목을 웹/모바일로 포팅한 1v1 칼싸움 듀얼.

**잼 마감**: 2026-05-01 13:37 UTC.

**플랫폼 / 입력**: PC 1차 타겟. 게임플레이는 **마우스 전용** — 키보드 없이 풀 플레이 가능. (D키 디버그 패널은 개발자 전용.) 모바일(터치/자이로) 호환은 P2 폴리시.

## 어디에 뭐가 있는가

- **`docs/`** — 사람이 읽는 디자인/기획/구현 레퍼런스. 인덱스: `docs/CLAUDE.md`
- **`claudedocs/`** — AI 리서치 보고서 (Switch Sports 메카닉, 시각, 타격감). 인덱스: `claudedocs/CLAUDE.md`
- **`docs/references/`** — Switch Sports 스크린샷 (시각·UI 레퍼런스)
- **`shared/`** — 클라/서버 공유 워크스페이스. 핵심 전투 로직: `shared/src/combat/CLAUDE.md`
- **`client/src/duel/`** — **메인 게임 모듈** (R3F 렌더링 + 입력 + 매치 진행). 모듈 가이드: `client/src/duel/CLAUDE.md`
- **`client/src/demo/`** — 초기 프로토타입 (`?demo=arena`, `?demo=sword`, `?demo=character`)
- **`client/src/game/`** — 폐기된 비행기 스캐폴드 (R3F+Colyseus 인프라 검증용으로만 유지)
- **`server/src/`** — 폐기된 비행기 Colyseus 스캐폴드. 듀얼 멀티는 `worker/`로 이전.
- **`worker/src/`** — Cloudflare Worker + Durable Objects 권위 랭크 백엔드 (Phase 11a). `RankedQueue` + `DuelRoom` DO, 30Hz `state` broadcast, ELO K=32 matchOver. 자세한 상태/프로토콜: `docs/ranked-multiplayer-cloudflare.md` §"구현 상태"

## 작업 시작 시 우선 읽어야 할 문서

1. `docs/duel-implementation.md` — **현재 빌드된 시스템의 단일 진실 소스**. 룰→코드 매핑, 튜닝 노브, Phase 히스토리.
2. `docs/game-design.md` — 컨셉/메카닉/입력 모델/잼 일정 (§6.1)
3. `docs/ranked-multiplayer-cloudflare.md` — 무료 범위 랭크 1v1 서버/배포 전략
4. `claudedocs/research_chambara_visuals_20260429.md` §7 — Day 1 시각 P0 작업 순서

## 현재 상태 (2026-05-01 잼 마감 당일 — Phase 18 완료)

- **라이브 배포** (Phase 13, 2026-04-29): Worker `chambara-ranked-worker.200tiger1.workers.dev` + Pages `chambara-duel.pages.dev`. CI/CD GitHub Actions, RANKED_QUEUE/DUEL_ROOM/LEADERBOARD DO v1+v2 마이그레이션.
- **Phase 16** (2026-04-30, 15+ commits): 3 sword presets(BASIC/CHARGE/RAPIER) + character/weapon picker, per-weapon slice/thrust 타이밍 분리, `arena.ts` 단일 진실 소스, `blade-tip-predictor` 옵저버 보간, abandonment forfeit, 사전-KO 슬로모 인프라(비활성), Water → 가시 함정, 콜로세움 → 사이파이 인더스트리얼 챔버 + 사이버펑크 스카이라인 백드롭.
- **Phase 17** (2026-05-01, db003db): 오디오 통합. Howler 21 SFX + 4 BGM streaming + 2 ambient loop + Web Audio reactive saber hum + Credits 모달. `client/src/duel/audio/` 모듈.
- **Phase 18** (2026-05-01 잼 D-day 최종 튠, 13 commits): 8방향 슬래시 + 전용 Stun reaction 클립, Mixamo hips root motion 25% 댐핑(클립 슬라이딩 fix), 봇 가드 PI/4 snap → 연속 각도 + critical-damped 스무딩 + 손-tremor wobble + 35% react-mirror, 옵저버 perspective 가드/blade tip facing flip 보정, spawn 거리 ±1.0 → ±1.5(총 3.0 unit), 넉백 전 프리셋 0.75× 재튠(BASIC 3.0/3.75/4.5 등), 솔로 replay BGM 트리거, 페이지 title.
- **남은 작업**: 잼 컴플라이언스 체크리스트 검증(AI 코드 비율 ≥90%, 즉시 로딩, 즉시 멀티플레이), 두 창 라이브 매칭 smoke test, iOS Safari sanity check.

## 코드 작성 규칙

- TypeScript strict, 모노레포 (Yarn Workspaces)
- 전투 로직은 **`shared/src/combat/`에 순수함수로** — 권위 서버/리플레이 호환 위해 결정론 유지
- 클라 전용 코드(R3F 컴포넌트, 입력 훅)는 `client/src/duel/`
- 새 기능 → `docs/duel-implementation.md` §3 사용자 피드백 표 + §9 작업 히스토리에 기록
- 빌드 검증: `yarn workspace @vibejam/shared build && yarn workspace @vibejam/client typecheck`

## 빠른 명령어

- `yarn dev:client` — Vite dev (HTTP)
- `yarn dev:client:https` — iOS 자이로/LAN 폰용 HTTPS
- `yarn dev` — client + server concurrently (현재 server는 듀얼에 안 쓰임)
