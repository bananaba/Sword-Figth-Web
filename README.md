# Pieter Vibe Jam Game — Chambara Duel

피터 레벨스(@levelsio)의 **Cursor Vibe Jam 2026**에 출품할 웹 게임 프로젝트.

**현 컨셉**: Nintendo Switch Sports의 *Chambara* 종목을 웹으로 포팅한 1v1 칼싸움 듀얼. 마우스로 검 각도를 직접 조작, **두 검이 직각에 가까울 때만 막힘**. 상세는 [`docs/game-design.md`](./docs/game-design.md).

**플랫폼 / 입력**: PC 1차 타겟. 게임플레이는 **마우스 전용** — 키보드 없이도 풀 플레이 가능 (좌클릭 슬라이스, 휠클릭/더블 클릭 찌르기, 우클릭 가드). 모바일(터치/자이로) 호환은 잼 마감 전 시간 남으면 추가하는 P2 폴리시.

- **클라이언트**: Vite + React + TypeScript + Three.js (React Three Fiber)
- **랭크 서버**: `worker/` Cloudflare Workers + Durable Objects (`RankedQueue`, `DuelRoom`, `Leaderboard`) 구현
- **레거시 서버**: 현재 Colyseus 스캐폴드는 비행기 인프라 검증용으로만 유지
- **공유**: `shared/` 워크스페이스에 클라/서버 공통 타입
- **빌드**: Yarn Workspaces (모노레포)

## 빠른 시작

```bash
yarn install
yarn dev                  # client(5173) + server(2567) 동시 실행
yarn dev:client:https     # iOS 자이로 / LAN 폰 접속용 HTTPS
yarn test:worker          # Cloudflare ranked worker tests
```

자세한 내용은 [`docs/setup.md`](./docs/setup.md), 데모 라우트는 [`docs/prototypes.md`](./docs/prototypes.md).

## 라이브 데모

PC 개발은 `yarn dev:client` (HTTP). HTTPS는 `?demo=sword` 자이로 모드 테스트용일 뿐 메인 게임은 HTTP만으로 충분.

| URL | 내용 |
| --- | --- |
| `/` | **메인 듀얼** — Solo vs AI, Ranked Online, Private Room, 4-player Tournament match rooms. PC 마우스 컨트롤. |
| `/?demo=arena` | Chambara 트레이닝 아레나 — 직각 블록 + 점수 + 슬라이더 (참고 보존) |
| `/?demo=sword` | 검 각도 입력 프로토타입 (마우스/터치/자이로 — P2용 모바일 검증) |
| `/?demo=character` | Three.js 휴먼 캐릭터 렌더링 검증 |
| `/?demo=duel-input` | 2D SVG로 resolver 룰 검증 |
| `/?demo=scaffold` | 폐기된 비행기 스캐폴드 (R3F+Colyseus 인프라 검증용) |

## 문서

### 게임 디자인
- [`docs/game-design.md`](./docs/game-design.md) — **컨셉·메카닉·입력 모델·반복 기록·미결정**
- [`docs/prototypes.md`](./docs/prototypes.md) — 데모 라우트별 사용법·튜닝·디버깅

### 잼 / 시장 조사
- [`docs/vibe-jam.md`](./docs/vibe-jam.md) — Vibe Coding Game Jam 규칙·일정·심사
- [`docs/submitted-games.md`](./docs/submitted-games.md) — 1·2회 출품작 분포·수상작·화이트스페이스
- [`docs/fly-pieter-research.md`](./docs/fly-pieter-research.md) — fly.pieter.com 레퍼런스
- [`docs/tripo3d.md`](./docs/tripo3d.md) — Tripo3D 캐릭터 에셋 활용 가이드

### 기술
- [`docs/duel-implementation.md`](./docs/duel-implementation.md) — **현재 빌드된 듀얼 시스템 레퍼런스** (파일 구조, 룰→코드 매핑, 튜닝 노브, 미해결 항목)
- [`docs/ranked-multiplayer-cloudflare.md`](./docs/ranked-multiplayer-cloudflare.md) — 무료 범위 랭크 1v1 멀티 서버/배포 전략
- [`docs/architecture.md`](./docs/architecture.md) — 시스템 아키텍처
- [`docs/tech-stack.md`](./docs/tech-stack.md) — 기술 선택과 근거
- [`docs/setup.md`](./docs/setup.md) — 개발 환경 셋업
