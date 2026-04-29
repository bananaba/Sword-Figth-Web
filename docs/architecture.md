# 아키텍처

## 모노레포 구조

```
pieter/
├── package.json              # Yarn Workspaces 루트
├── tsconfig.base.json        # 공통 TS 설정 (strict 등)
├── client/                   # @vibejam/client
│   ├── src/
│   │   ├── main.tsx          # React 부트스트랩
│   │   ├── App.tsx           # 루트 레이아웃 (Game + Hud)
│   │   ├── game/             # R3F 씬 (Game / World / LocalPlayer / RemotePlayers)
│   │   ├── components/       # DOM 오버레이 (Hud)
│   │   ├── hooks/            # useInput, useNetwork
│   │   ├── stores/           # Zustand (gameStore)
│   │   └── styles/           # 전역 CSS
│   ├── public/               # 정적 에셋 (favicon 등)
│   ├── index.html            # vibejam 위젯 삽입
│   └── vite.config.ts
├── server/                   # @vibejam/server (레거시 Colyseus 스캐폴드)
│   ├── src/
│   │   ├── index.ts          # listen()
│   │   ├── app.config.ts     # Colyseus 앱 설정 + Express
│   │   ├── rooms/GameRoom.ts # 폐기된 비행기 멀티플레이 룸
│   │   └── schemas/          # @colyseus/schema 정의 (네트워크 상태)
│   └── tsconfig.json
├── shared/                   # @vibejam/shared (양쪽 공통 타입/프로토콜)
│   └── src/
│       ├── types.ts          # Vec3, Quat, PlayerSnapshot, InputCommand
│       └── protocol.ts       # ROOM_NAME, MessageType, ChatMessage
└── docs/                     # 문서 (이 문서 포함)
```

## 데이터 / 상태 흐름

### 현재 메인 듀얼 (`/`)

현재 메인 게임은 `client/src/duel/`에서 로컬 vs AI로 동작한다. 전투 판정은 `shared/src/combat/`의 순수 함수가 담당하며, 서버 권위 멀티 전환 시에도 이 resolver를 재사용한다.

### 계획: 랭크 1v1 Cloudflare 구조

```
        [브라우저]                             [Cloudflare]
   ┌────────────────────┐   WebSocket    ┌──────────────────────┐
   │ React + R3F Duel   │ <────────────> │ DuelRoom Durable Obj │
   │  ├─ mouse input    │   input/guard  │  ├─ pending attacks  │
   │  ├─ visual predict │   state/impact │  ├─ resolveAttack    │
   │  └─ HUD/rating     │                │  └─ applyOutcome     │
   └────────────────────┘                └──────────────────────┘
              │                                      │
              │ /matchmake                           │ ELO update
              ▼                                      ▼
       ┌──────────────┐                    ┌────────────────────┐
       │ RankedQueue  │                    │ DO SQLite / KV     │
       │ Durable Obj  │                    │ rating/leaderboard │
       └──────────────┘                    └────────────────────┘
```

자세한 결정은 `docs/ranked-multiplayer-cloudflare.md`가 기준이다.

### 레거시: Colyseus 비행기 스캐폴드

```
        [브라우저]                                  [Node 서버]
   ┌────────────────────┐    WebSocket (Colyseus)    ┌──────────────────────┐
   │ React + R3F        │ <───────────────────────>  │ Colyseus GameRoom    │
   │  ├─ LocalPlayer    │   1. Input 메시지(20Hz)     │  ├─ onMessage(input) │
   │  ├─ RemotePlayers  │   2. State 패치(델타)       │  ├─ setSimulation    │
   │  └─ Hud (zustand)  │                            │  └─ MapSchema<player>│
   └────────────────────┘                            └──────────────────────┘
            │                                                  │
            │  로컬 60Hz 시뮬레이션 + 보간                      │  서버 20Hz 틱
            └──────────────────────────────────────────────────┘
```

### 클라이언트
- **렌더 루프**: R3F `useFrame` (브라우저 vsync, 보통 60Hz).
- **메인 듀얼**: 마우스 입력 → `useDuelLoop` → 로컬 vs AI. 멀티 전환 후에도 클라는 visual prediction과 입력 송신을 담당.
- **레거시 비행기 스캐폴드**: 클라이언트 권위. 키보드 입력 → 위치 갱신을 즉시 반영.
- **원격 플레이어**: 서버 상태 → Zustand 스토어 → `RemotePlayers` 컴포넌트 렌더. 추후 보간(interpolation) 추가 예정.
- **네트워크**: `useNetwork()` 훅이 `Client.joinOrCreate("world")` 후 룸 핸들을 스토어에 저장. `LocalPlayer` 가 매 프레임 마다 `Input` 메시지 송신 (3프레임당 1회 = ~20Hz).

### 서버
- **Cloudflare Workers + Durable Objects (계획)**: 랭크 1v1의 주 서버 경로. `RankedQueue` DO가 매칭, `DuelRoom` DO가 서버 권위 판정과 WebSocket broadcast를 담당.
- **Colyseus (레거시)**: 룸 / 매치메이킹 / 상태 동기화 / 모니터링이 내장된 multiplayer-game 프레임워크. 현재 `GameRoom`은 비행기 스캐폴드 검증용이다.
- **GameRoom (이름 `world`)**:
  - `onJoin`: 플레이어 스폰 (반경 200 원형 분포).
  - `onMessage("input")`: 클라이언트 입력으로 속도 누산.
  - `setSimulationInterval`: 50ms (20Hz) 마다 위치 적분 + 드래그.
  - 상태는 `@colyseus/schema` 의 `MapSchema<PlayerState>` — 변경분만 델타로 자동 송신.
- **Express 미들웨어**:
  - `GET /healthz` — 헬스체크.
  - `/colyseus` — 룸 모니터링 대시보드 (관리자용).
  - `/playground` — 개발 모드에서만 활성화되는 룸 테스트 도구.

### shared
- 클라/서버가 import 하는 단일 진실 소스. 타입 변경 시 양쪽 컴파일 에러로 감지.
- 빌드 산출물 (`dist/`)이 워크스페이스 내 npm 링크를 통해 양쪽에 노출됨.

## 빌드 / 의존 그래프

```
shared(빌드 선행) → client / server
```

- `yarn build` → shared 빌드 → client 빌드 → server 빌드 순서.
- 개발 시 `yarn dev` → concurrently 로 client (Vite HMR) + server (tsx watch) 동시 기동.

## 확장 시나리오

| 요구 | 대응 |
| --- | --- |
| 싱글플레이 부터 시작 | `useNetwork` 가 실패해도 게임은 동작 (현재 구현). 서버 끄고 동작. |
| 온라인 랭크 PvP 로 전환 | Cloudflare `RankedQueue` DO + `DuelRoom` DO 추가. 클라는 입력만 송신. |
| 영구 점수판 | Durable Object SQLite에 rating 원본 저장, Workers KV로 leaderboard cache. |
| 안티치트 | `DuelRoom` DO에서 cooldown/stun/motion gate와 `resolveAttack`을 서버 권위로 처리. |
| 모바일 컨트롤 | `useInput` 에 터치 가상 스틱 추가, 키보드와 동일 인터페이스 유지. |
| 광고 슬롯 | World 에 3D 빌보드 mesh 추가, 텍스처는 동적 `CanvasTexture`. |
