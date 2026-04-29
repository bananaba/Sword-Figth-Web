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
- **`server/src/`** — Colyseus 멀티플레이 서버 (현재는 폐기된 GameRoom, 잼 후반에 DuelRoom으로 리팩토링 예정)

## 작업 시작 시 우선 읽어야 할 문서

1. `docs/duel-implementation.md` — **현재 빌드된 시스템의 단일 진실 소스**. 룰→코드 매핑, 튜닝 노브, Phase 히스토리.
2. `docs/game-design.md` — 컨셉/메카닉/입력 모델/잼 일정 (§6.1)
3. `claudedocs/research_chambara_visuals_20260429.md` §7 — Day 1 시각 P0 작업 순서

## 현재 상태 (2026-04-29)

- Phase 7 완료: 카메라 추격, 검·가드 캐릭터 동기화, 스턴 시스템 통합, 라이트세이버 테마 결정
- **다음 작업**: Step 1 = postprocessing + Bloom 도입 (`@react-three/postprocessing`)
- **Day 1 잔여 시각 P0**: Bloom → 검 emissive HDR → 트레일 → 임팩트 링/셰이크 → KO splash → 물 셰이더
- **Day 2 작업**: Colyseus DuelRoom (**사설방 2/4/8/16인 자동 토너먼트 브래킷 포함**) → 랭크/MMR (1대1 자동 매치) → Vercel 배포

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
