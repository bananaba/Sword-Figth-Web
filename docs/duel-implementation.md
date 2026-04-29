# Chambara Duel — Implementation Reference

> 마지막 업데이트: 2026-04-29 (Phase 11c + 11.5 — Leaderboard DO + 영속 ratings + `LeaderboardView`, sparks 파티클 (`THREE.Points` ring-buffer + custom ShaderMaterial))
>
> `docs/game-design.md`가 *컨셉/요구사항* 문서라면 본 문서는 *현재 빌드된 시스템*의 레퍼런스.
> 파일 경로, 책임 분리, 룰 → 코드 매핑, 튜닝 노브, 미해결 항목 정리.
>
> **플랫폼 / 입력**: PC 1차, **마우스 전용** (키보드 미사용). 좌클릭 슬라이스 / 휠클릭 또는 더블 클릭 찌르기 / 우클릭 가드. 모바일 입력 코드(`useSwordInput.ts`의 자이로/터치)는 `?demo=sword`에서만 활성 — 메인 `/` 라우트는 PC 마우스 입력만. 모바일 호환은 P2 폴리시. (D키는 개발자 전용 debug panel 토글로 게임플레이 입력에 포함 안 됨.)

---

## 1. 시스템 구조

```
shared/src/combat/      # 클라/서버 공유 — 결정론적 순수 로직 (랭크 게임 대비)
  types.ts              # Vec2, FighterState, GuardSnapshot, AttackEvent, Outcome, WeaponStats
  geometry.ts           # 선분/박스 교차, 두 선의 예각
  weapons.ts            # PLASMA_BLADE 디폴트 + 확장 포인트 (IP-안전 네이밍, Phase 9.5)
  resolver.ts           # resolveAttack / applyOutcome / tickFighter
  index.ts              # 배럴 익스포트 (`@vibejam/shared`로 노출)

client/src/duel/        # 게임 클라이언트 (3D 렌더 + 입력 + 매치 진행)
  Duel.tsx              # 디폴트 라우트 `/`. Canvas + Bloom + GameStage + HUD + 카메라 셰이크
  Arena3D.tsx           # 발판 (페데스탈/내부 디스크/외곽 림/발광 페리미터) + 조명/하늘
  Water.tsx             # 스타일라이즈 워터 ShaderMaterial (Phase 8)

worker/src/            # Cloudflare Worker + Durable Objects 권위 랭크 서버 (Phase 11a)
  index.ts              # 라우터: /healthz, /leaderboard, /matchmake, /rooms/:id, OPTIONS preflight
  http.ts               # json() + corsPreflight() — 응답에 CORS 헤더 강제 부착
  bindings.ts           # Env 인터페이스 (RANKED_QUEUE, DUEL_ROOM)
  protocol.ts           # MatchmakePlayer 타입 + parser
  rating.ts             # ELO K=32 expectedScore / applyEloResult
  ranked-queue.ts       # RankedQueue DO — in-memory ±200 매칭, 매치 성사 시 roomId 발급
  duel-room.ts          # DuelRoom DO — WS upgrade + alarm 기반 30Hz tick 스케줄
  duel-session.ts       # DuelRoomSession — hello/ready/guard/attack 핸들링 + 매치 상태머신 + state broadcast
  test/*.test.js        # node:test 30/30 (rating · queue · room · http)
  Fighter.tsx           # 캐릭터 + 검 (phase-based 포즈) + drei `<Trail>` + 스턴 별
  ImpactRings.tsx       # outcome 발화 시 확장 링 풀 (Phase 8) — useImpacts 스토어 구독
  TitleScreen.tsx       # 이름 + 5 세이버 색 프리셋 + Solo/Ranked 모드 토글 (Phase 9.5/11b)
  useDuelLoop.ts        # 솔로 모드 매치 상태머신, pendingAttack, 가드, 물리 tick — outcome 시 dispatchImpactFx 호출
  useRankedMatch.ts     # 랭크 모드 어댑터 (Phase 11b) — UseDuelLoop과 같은 shape, 서버 state 인터폴레이션, impact 메시지 → dispatchImpactFx
  useMouseInput.ts      # drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드
  ai.ts                 # 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice)
  dispatchImpactFx.ts   # 5축 FX 단일 진입점 (Phase 10a) — ring·shake·time·flash·vibrate ±1 프레임 동시 발화
  network/types.ts      # 클라/서버 와이어 프로토콜 (ServerMessage / ClientMessage) — Phase 11b
  network/matchmake.ts  # POST /matchmake + 큐 폴링 + playerId·rating localStorage — Phase 11b
  network/RankedClient.ts # WS 래퍼 (open/close/send/onMessage 디스패치, outbox 버퍼) — Phase 11b
  network/leaderboard.ts # GET /leaderboard, /me 클라 fetch — Phase 11c
  LeaderboardView.tsx   # Top 20 + 내 기록 행 (TitleScreen에서 진입) — Phase 11c
  SparkParticles.tsx    # `THREE.Points` 풀 (POOL_SIZE 256) — useImpacts 구독, kind별 burst 발사 — Phase 11.5
  stores/useImpacts.ts  # outcome 이벤트 풀 (hit/pierce/block/ko) — Phase 10a
  stores/useShake.ts    # Eiserloh 트라우마 모델 (add/decay) — Phase 10a
  stores/useFlash.ts    # 풀스크린 화이트 플래시 envelope (HIT/PIERCE/KO) — Phase 10b
  stores/useTimeScale.ts# hit-stop + KO slow-mo envelope (freeze/hold/ease) — Phase 10b
  DuelHud.tsx           # 라운드 점수/타이머/카운트다운/KoSplash + 스턴 바
  DuelDebug.tsx         # D키 패널 — 16개 weapon stat 슬라이더 + 히트박스 와이어
  InputDemo.tsx         # 2D SVG로 resolver 검증 (?demo=duel-input)
```

**라우트** (`App.tsx`):
| URL | 컴포넌트 |
| --- | --- |
| `/` | `Duel` — 메인 게임 (vs AI Bo3) |
| `/?demo=duel-input` | 2D 입력 검증 |
| `/?demo=arena` `?demo=sword` `?demo=character` | 초기 프로토타입 (참고 보존) |
| `/?demo=scaffold` | 폐기된 비행기 스캐폴드 (R3F+Colyseus 인프라 검증용) |

---

## 2. 좌표 모델

전투 수학은 단일 **2D blade plane**에서 수행:
- `(x, y)`: 화면 평면. x = 좌우, y = 위 (위가 양).
- 양 캐릭터의 `bodyHitbox`는 모두 `(0, 0..1.7)`에 위치 (silhouette 동일).
- **Z** = duel-line 축. 캐릭터 간 거리. resolver의 `posX` 필드가 사실상 world Z를 나타냄 (이름은 시스템 구조상 그대로 유지).

3D 렌더링:
- Player initial world `(0, 0, -1.6)`, faces +Z
- Opponent initial world `(0, 0, +1.6)`, faces -Z
- Camera **directly behind player + slightly above**: 시작 `(0, 2.05, -3.2)` 기준, 매 프레임 `playerZ - 1.6`로 lerp(0.22) 추격, lookAt = `(0, 1.1, camera.z + 3.7)` (Switch Sports 챔버라 카메라 매칭)
- 마우스 → **player worldZ에 위치한 blade plane** raycast → `(x, y)` 추출 (`Duel.GameStage.toWorld`). 카메라가 추격하므로 raycast 평면도 함께 이동 → 마우스 게인 일정.
- 검은 fighter group의 worldZ에 lock된 채 `SWORD_FORWARD_OFFSET = 1.6` 만큼 앞으로 떨어져서 그려짐 → knockback 시 검·가드가 캐릭터 따라 이동.

---

## 3. 룰 → 코드 매핑

### 3.1 사용자 초기 요구사항 (1차 7개)

| # | 요구사항 | 구현 위치 |
|---|---|---|
| 1 | 마우스만 컨트롤 (찌르기는 dbl/mid-click) | `useMouseInput.ts` |
| 2 | 공격이 상대 body 통과해야 적중 | `geometry.segmentIntersectsBox` |
| 3 | 공격간 쿨다운 (난타 방지) | `WeaponStats.attackCooldownMs` + duel loop |
| 4 | 카운터 슬라이스/찌르기 동일 넉백 | `resolver.resolveAttack` `counterActive ? counterKnockback : ...` |
| 5 | 무기 stat 확장 가능 | `WeaponStats` 16개 필드, resolver는 weapon-agnostic |
| 6 | 방향 가드 (위/아래 별도) | `geometry.segmentsIntersect(slice, guard)` — 가드 위치 안 맞으면 통과 |
| 7 | 연속 각도 (4축 스냅 X) | `geometry.acuteAngleBetween` + `guardAngleTolerance` |
| 8 | 랭크 게임 대비 | resolver 순수함수 + 결정론, `shared/`에 배치 → 서버 권위/리플레이 호환 |

### 3.2 사용자 2차 피드백 (4개 — Phase 6a/b)

| # | 피드백 | 구현 위치 |
|---|---|---|
| 1 | 가드 = 마우스 벡터에 수직, 중앙(chest) 기준 | `useDuelLoop.buildPerpendicularGuard` |
| 2 | 푸시-얼롱 (공격자도 같은 방향으로 이동) | `resolver.applyOutcome` `attackerFollowFraction` |
| 3 | 이동 중 + 적중 직후 immunity | `resolver.resolveAttack` motion/trade 체크, `tradeImmuneUntil` |
| 4 | 공격 모션 (telegraph) | `useDuelLoop` pendingAttack + `Fighter` phase 애니메이션 |

### 3.3 사용자 3차 피드백 (4개 — Phase 6c)

| # | 피드백 | 수정 |
|---|---|---|
| 1 | 모든 공격이 REJECTED | `resolver.resolveAttack`에서 `attackCooldownUntil` 체크 제거 (duel loop이 input gate 담당) |
| 2 | 찌르기 모션이 슬라이스와 동일 | `commitPending`에서 kind별 visual start/end 분기 — 찌르기는 `chest + dir * 0.15` → `chest + dir * fullReach` |
| 3 | 내 캐릭터 투명도 | `FighterVisualState.transparentWhenIdle` + idle 판정(`!attack && !stunned && speed < 0.5`) → opacity 32% |
| 4 | 가드 위치는 중앙 유지 | `buildPerpendicularGuard`이 chest 중심, 마우스는 방향만 결정 |

### 3.4 사용자 4차 피드백 (Phase 7 — jam-prep balance + camera + stun)

| # | 피드백 | 수정 |
|---|---|---|
| 1 | 카메라가 캐릭터 바로 뒤+살짝 위 (Switch Sports 매칭) | `Duel.tsx` cameraInit `[0.6, 1.95, -3.1]` → `[0, 2.05, -3.2]`, lookAt `(0, 1.0, 0.4)` → `(0, 1.1, 0.5)` |
| 2 | 넉백 시 카메라 추격 + 검·가드 중앙점도 함께 이동 | useFrame에서 camera Z를 `playerZ - 1.6`로 lerp(0.22). `Fighter.tsx` `worldBladePlaneToLocal` → `bladePlaneToLocal` (검 z를 fighter group 기준 상수). raycast plane도 player worldZ로 이동. |
| 3 | 투명화는 스턴/트레이드 면역 시에만 풀려야 | `FighterVisualState.tradeImmune` 추가. 옵팩 조건: `s.stunned \|\| s.tradeImmune` (이전: idle 아닌 모든 경우) |
| 4 | 거리 일정 유지 + 이동 빠르게 + 이동 중 무적/공격불가 | `attackerFollowFraction` 0.5 → 1.0. `FRICTION` 2.5 → 5.0. `commitPending`에 motion gate 추가. resolver에 trade immunity는 이미 존재. |
| 5 | 슬라이스 < 카운터 < 찌르기 가치 위계 | sliceKnockback 8 (변위 1.6), counterKnockback 10 (변위 2.0), thrustKnockback 14 (변위 2.8). 5히트 안 KO 페이스. |
| 6 | 가드에 막히면 짧은 무력화 (공격·가드 모두 불가) | thrust block에도 stun 적용. resolver `event.kind === "thrust"` block에 `attackerStun: weapon.stunMs` 추가. |
| 7 | 스턴 표시 (예시 이미지 별 2개) | `Fighter.tsx`에 noddy yellow 5각 별 2개 메시. `stunGroupRef.current.visible = s.stunned`. 회전 + 보빙. |
| 8 | 스턴 시간 길게 + 피격 시 즉시 해제 | `stunMs` 800 → 1500. `applyOutcome`의 hit/pierce 분기에 `defender.stunUntil = 0` 추가. |
| 9 | 스턴 / 카운터 윈도우 / thrust block stun 변수 통합 | `WeaponStats`에서 `counterWindowMs` / `thrustBlockStunMs` 제거, `stunMs` 하나로 통합 (DRY + 안전). |

---

## 4. 전투 모델 디테일

### 4.1 공격 라이프사이클 (pendingAttack)

```
input  →  windUp (windUpMs)  →  impact (resolver 발동)  →  swing (swingDurationMs)  →  recovery → ready
T=0       T=0..280               T=280                      T=280..400                T=400..600
```

- **input**: 마우스 입력 → `handlePlayerAttack` / `handleOpponentAttack` → `commitPending`
  - 거절 조건: `now < attackCooldownUntil`, `now < stunUntil`, 이미 pending 존재, **`|velX| > motionImmunityVelocityThreshold`** (이동 중 공격 입력 거부 — Phase 7)
  - 즉시 `attackCooldownUntil = inputTime + attackCooldownMs` 설정 (input 잠금)
- **windUp**: 검이 idle 위치에서 `attack.start`로 lerp, 주황 발광
- **impact**: `tick` 안에서 `now >= impactAt && !resolved` 시 `resolveAttack` 호출
- **swing**: `attack.start → attack.end` lerp, 노란 발광
- **recovery**: `attack.end → idle` lerp, 색상 normal

`Fighter.tsx`의 `currentSwordPose`가 phase에 따라 sword endpoints/색상 결정. 공격 중에는 가드 자동 비활성 (`setPlayerGuard` / `setOpponentGuard`이 pending 체크).

### 4.2 가드 모델

검 segment를 `chest ± perp(pointer) * (bladeLength / 2)`로 구성:
- `chest = (0, 1.15)` (player/AI 동일)
- `pointer = mouse position` (player) 또는 `chest + dir(angle) * 1` (AI)
- `perp = rotate90(normalize(pointer - chest))`

방향이 마우스 벡터에 수직 → "마우스가 가리키는 방향에서 들어오는 공격을 막는 자세".

### 4.3 슬라이스/찌르기 visual 분기

`commitPending`에서 kind별로 `start`/`end`를 다르게 계산 → Fighter는 단일 로직으로 호 그리기:

```
slice:  start = atk.start (drag start)
        end   = atk.end   (drag end)
        효과: grip 중심으로 검 회전, tip이 호를 그림

thrust: start = chest + dir * 0.15  (당겨진 자세, 짧은 검)
        end   = chest + dir * (bladeLength + thrustReach)  (밀어내기 끝, 긴 검)
        효과: 검이 visibly 길어지며 앞으로 뻗음
```

### 4.4 공격 판정 결정 트리 (`resolver.resolveAttack`)

```
1. now < attacker.stunUntil  →  REJECTED (스턴 중)
2. attack 경로가 defender body 통과 X  →  MISS
3. 어느 쪽이든 |velX| > motionImmunityVelocityThreshold  →  MISS (이동 중)
4. now < defender.tradeImmuneUntil  →  MISS (직전 trade 방지)
5. kind === "thrust":
     - defender 가드 활성  →  BLOCK + STUN (각도 무관, 넉백 없음, 공격자 stunMs 락아웃)
     - 무방비  →  HIT (counter 활성 시 counterKnockback)
6. kind === "slice":
     - 가드 비활성 또는 가드가 슬라이스 경로와 교차 X  →  HIT
     - 가드 교차 + 각도가 ⊥ ± guardAngleTolerance  →  BLOCK + STUN + 디펜더 카운터 윈도우
     - 가드 교차 + 평행쪽  →  PIERCE (HIT 통과)
```

**Phase 7 변경**: thrust block에 STUN 추가. slice block과 동일한 `stunMs` 락아웃을 공격자에 적용. 단 thrust block은 디펜더에게 **카운터 윈도우 부여 안 함** (각도 mind game이 아닌 단순 가드만 있으면 막혀서, 보상 차등).

### 4.5 결과 적용 (`resolver.applyOutcome`)

| 발동 조건 | 처리 |
|---|---|
| 항상 (rejected 아니면) | `attackCooldownUntil = max(기존, now + attackCooldownMs)` (`Math.max`로 commitPending이 설정한 input-anchor cooldown 보존) |
| `hit` / `pierce` | `counterUntil = 0` (보너스 소비), `attacker.tradeImmuneUntil = now + tradeImmuneMs`, **`defender.stunUntil = 0`** (피격 시 스턴 즉시 해제 — Phase 7) |
| `block` | `attackerStun > 0` → 공격자 stun, `defenderCounterWindow > 0` → 방어자에게 counter window |
| `knockback > 0` | `defender.velX += facing * knockback`, `attacker.velX += facing * knockback * attackerFollowFraction` (현재 `attackerFollowFraction = 1.0` → 거리 보존) |

---

## 5. 매치/라운드 구조

`useDuelLoop.MatchState`:
```
phase ∈ {countdown, fighting, roundOver, matchOver}
```

전이:
- `countdown` (3000ms) → `fighting` (포지션/state 리셋)
- `fighting` 종료 조건:
  - `|playerZ| > arenaRadius` → opponent 승
  - `|opponentZ| > arenaRadius` → player 승
  - 둘 다 → draw
  - `phaseElapsed >= 45000ms` → 중심 가까운 쪽 승 (또는 draw)
- `roundOver` (2200ms) → 다음 라운드 또는 `matchOver`
- 누군가 2승 → `matchOver` (New match 버튼)

물리는 `phase === "fighting"`일 때만 진행. 다른 phase에서는 velocity 0.

---

## 6. AI

`ai.tickAi`는 매 프레임 호출되어:
1. 스턴 중이면 가드 비활성 + 무행동
2. `nextGuardChangeAt` 도달 시 새 각도 선택 (8방향 중 랜덤 + 노이즈)
3. `nextAttackAt` 도달 또는 counter window 활성 시 공격 생성
   - 25% (`thrustChance`): 좌/우에서 가로 찌르기
   - 75%: 슬라이스 — 40% 확률로 player 가드와 평행 각도 선택 (smart-slice = pierce 노림)

생성된 공격은 `commitPending`을 거쳐 동일한 windUp 사이클 적용 → 플레이어가 280ms windUp 동안 보고 가드 조정 가능.

`AiTuning` 객체로 난이도 노브 (현재 단일 프리셋 `DEFAULT_AI`). 랭크 도입 시 시드 RNG로 결정론화 필요.

---

## 7. WeaponStats 튜닝 노브 (Phase 7 후 14개)

D키로 디버그 패널 열어서 실시간 슬라이더 조정 가능.

### 넉백 — slice < counter < thrust 위계 (Phase 9.5 후 -25% 튠)
- `sliceKnockback` (6.0) — per-hit 변위 = 6.0/FRICTION = **1.2 unit** (Phase 9.5 후 8.0→6.0)
- `counterKnockback` (7.5) — 가드 후 윈도우 안 공격 시 보너스. 슬라이스보다 살짝 위 (변위 1.5). 가드 측의 보상. (Phase 9.5 후 10.0→7.5)
- `thrustKnockback` (10.5) — 가장 어려움 (어떤 가드든 막힘) → 가장 높은 보상. 변위 2.1 → 시작 ±1.6에서 1히트 KO 불가, 2-3히트 페이스. (Phase 9.5 후 14.0→10.5, 사용자 피드백 "넉백이 너무 큼")
- `attackerFollowFraction` (1.0) — push-along 비율. **1.0 = 풀 추격**으로 거리 보존 (Phase 7 변경: 0.5 → 1.0).

### 타이밍 — 단일 stunMs로 통합
- `attackCooldownMs` (600) — input → 다음 input 가능까지
- `windUpMs` (280) — slice 텔레그래프
- `thrustChargeMs` (280) — thrust 텔레그래프
- `swingDurationMs` (120) — swing 시각 시간
- `stunMs` (1500) — **블록 후 한 페이즈의 길이**. (a) 공격자 stun 락아웃, (b) 디펜더 카운터 윈도우, (c) thrust block stun 모두 같은 클럭. 피격 시 즉시 해제. (Phase 7 통합: 이전엔 `stunMs` / `counterWindowMs` / `thrustBlockStunMs` 3개 → 1개)
- `tradeImmuneMs` (250) — 적중 후 retaliation 방지 grace

### 판정
- `guardAngleTolerance` (30°) — perpendicular 허용폭
- `motionImmunityVelocityThreshold` (1.0) — 이상 속도면 양쪽 공격 무효 + `commitPending` 입력 거부 (Phase 7 추가)

### 형상
- `bladeLength` (1.2) — 검 segment 길이 = 가드 segment 길이
- `thrustReach` (1.4) — 찌르기 추가 reach
- `minSliceReach` (0.35) — 슬라이스 최소 드래그 거리 (탭 무시)

### 비-WeaponStats 상수
- `FRICTION = 5.0` (`useDuelLoop.ts`) — Phase 7: 2.5 → 5.0. exp 감속 계수, 반감기 138ms.
- `SWORD_FORWARD_OFFSET = 1.6` (`Fighter.tsx`) — body 앞으로 검을 그릴 거리.

---

## 8. 미해결 / 다음 단계

> 잼 마감 2026-05-01 13:37 UTC. Day 1 시각 P0 → Day 2 사설방·랭크·배포 순서. 상세는 `claudedocs/research_chambara_visuals_20260429.md` §7.

### 시각 시그니처 (잼 P0) — **Phase 8 완료**
- [x] **카메라 앵글** — 캐릭터 바로 뒤+살짝 위 + Z lerp 추격 (Phase 7)
- [x] **postprocessing + Bloom** — `@react-three/postprocessing` `<EffectComposer><Bloom luminanceThreshold=0.85, intensity=1.4, radius=0.7, mipmapBlur />` + ACESFilmic 톤매핑 (Phase 8)
- [x] **검 emissive 라이트세이버 톤** — 시안 `#38bdf8` 코어 + 화이트 글로우. emissiveIntensity: idle 1.4 / guard 2.2 / windUp 1.6 / swing **3.4** / recovery 1.2 (Phase 8)
- [x] **검 트레일** — drei `<Trail width=0.22 length=1.6 decay=3 attenuation=t²>`, 검 끝 invisible 마커에 부착 (Phase 8)
- [x] **임팩트 링/셰이크** — `useDuelLoop`에 `impactEvents` 큐 추가, `ImpactRings` 컴포넌트가 outcome별 색상(hit `#fde68a` / pierce `#fda4af` / block `#bfdbfe`)으로 0.25→1.45 expand + 페이드, 520ms. 카메라 셰이크는 pierce 0.13 / hit 0.10 / block 0.05, 220ms t² 페이드 (Phase 8)
- [x] **KO splash + 콜로세움 외곽 링 분리** — `MatchState.lastRoundReason: "ringout" | "timeout"`로 KO 분기. `KoSplash` 컴포넌트 132px "K.O.!" pop-in (180ms 0.5→1.1 → 셋틀). 아레나는 페데스탈/내부 디스크/외곽 림(`#4a3d2c`, RIM_LIFT=0.06) + 발광 페리미터 ring(`emissive #38bdf8` intensity 2.4)로 4-tier 분리 (Phase 8)
- [x] **Stylized water shader** — `Water.tsx` ShaderMaterial. 버텍스: 3-layer sine 변위(amp 0.06m). 프래그먼트: 깊이 그라디언트 + 흐르는 밴드 + 샤프 스파클(`pow(sp, 14)`) + 얇은 쇼어라인 폼(0.32m, `#7dd3fc`). 96×96 plane 세그먼트 (Phase 8)

### 게임플레이
- [ ] **AI 시드 RNG** — `Math.random` 대체. 랭크 리플레이/네트코드 결정론 필수
- [ ] **4라운드 서든데스** — 좁은 발판 + 2히트 KO (chambara 원작)
- [ ] **플레이어 이동** — 현재는 넉백으로만 위치 변화. WASD 이동? 아니면 의도적으로 X
- [ ] **무기 종류** — 차지 검 / 쌍검 / Timely Block (현재 PLASMA_BLADE 1종)

### 멀티플레이 / 랭크 (Day 2)
- [x] **Cloudflare RankedQueue Durable Object** (Phase 11a) — `playerId`/rating/name을 받아 ±200 범위 in-memory 매칭, 매치 성사 시 `ranked-{a}-{b}` roomId 발급. **TODO**: 30s 대기 시 범위 확장, DO storage 영속화, Worker 재시작 후 큐 보존.
- [x] **Cloudflare DuelRoom Durable Object** (Phase 11a) — WS upgrade, alarm 기반 30Hz tick. `DuelRoomSession`이 hello/ready/guard/attack 처리 + countdown→fighting→roundOver→matchOver 상태머신 + 서버 권위 `resolveAttack`/`applyOutcome` 호출. **TODO**: Hibernation API, room ID를 DO `state.id.name`으로 사용 (현재는 "duel-room" 하드코드).
- [x] **권위 서버 모델** (Phase 11a) — 클라는 가드 스냅샷 + 공격 이벤트만 송신. 이동은 outcome-driven (`applyOutcome` velX → `tickFighter` 적분 → ringout). 클라 입력 메시지에 walk/move 없음.
- [x] **`state` 30Hz broadcast** (Phase 11a) — fighting tick마다 `{ t: "state", serverNow, player, opponent }` 송신. 페이로드는 `{ posX, velX, guard, stunUntil, attackCooldownUntil, counterUntil }`. 클라가 상대 위치를 알 유일한 경로.
- [x] **ELO matchOver payload** (Phase 11a) — K=32, matchOver 메시지에 `ratings: { player: { before, after, delta }, opponent: {...} }` 포함. **TODO**: rating 원본 영속화 (DO SQLite), `/leaderboard` Top 20 (현재 빈 배열 stub), `/me` 조회.
- [x] **CORS** (Phase 11a) — `json()` 모든 응답에 `*` allow-origin + methods/headers, `OPTIONS` 프리플라이트 204.
- [ ] **클라 네트워크 어댑터** — `useRankedMatch` 훅, WS 연결, `state` 인터폴레이션 버퍼, `impact` → `dispatchImpactFx`. **다음 작업**.
- [ ] **`wrangler deploy` + 클라 env 분기** — Worker URL을 클라가 어떻게 받을지 (build-time env vs runtime config).
- [ ] **인증 / playerId** — 잼 범위에선 `localStorage["chambara.playerId"]` UUID + `["chambara.name"]` 기반. 영속화는 DO SQLite.
- [ ] **임팩트 시점 동기화** — 현재는 클라가 보낸 attack의 latest guard 판정. 여유 시 최근 200-300ms state history로 rollback 보정.
- [ ] **사설방/토너먼트** — P1/P2. 랭크 1v1 완성 후 room code와 4/8/16인 bracket으로 확장.

### 배포 / 컴플라이언스
- [ ] **무료 배포** — Cloudflare Pages 또는 Vercel(client) + Cloudflare Workers/Durable Objects(server). Render/Railway/Colyseus는 fallback.
- [ ] **모바일 동작 검증** (iOS Safari 자이로/터치)
- [ ] **AI 코드 비율 ≥ 90%** 점검
- [ ] **즉시 로딩** — 빌드 사이즈 / 첫 페인트 측정

### 컨텐츠 (P2 폴리시)
- [ ] **캐릭터 메시** — 현재 box+sphere placeholder. Quaternius 로우폴리 / Tripo3D 사전 풀
- [ ] **다리 메시 + walk 애니메이션** — knockback 시 자연스러운 이동 표현
- [ ] **사운드** — 충돌/스윙/넉백 SFX 0
- [ ] **MeshToonMaterial** — 카툰 톤 통일 (Phase 7 후 도입 권장)

### 코드 품질
- [ ] **테스트** — shared/combat에 vitest 단위 테스트 (resolver 룰 회귀 방지)
- [ ] **번들 크기** — 현재 1.25MB / gzip 353KB. dynamic import로 데모 라우트 분리
- [ ] **AI 설계 문서화** — 현재 ai.ts 내부 주석에만 존재

---

## 9. 작업 히스토리

| Phase | 내용 |
|---|---|
| 1 | `shared/combat/` 순수 로직 (types/geometry/resolver/weapons) |
| 2 | `useMouseInput` + `?demo=duel-input` 시각 검증 |
| 3 | `Arena3D` / `Fighter` / `Duel` / 어깨 너머 카메라 |
| 4 | AI 봇 + Bo3 라운드/매치 + `DuelHud` |
| 5 | `DuelDebug` D키 패널 + 와이어프레임 + 튜닝 슬라이더 |
| 6a | 가드 perpendicular / push-along 넉백 / motion·trade immunity |
| 6b | 공격 telegraph (windUp/swing/recovery) — pendingAttack 시스템 |
| 6c | resolver cooldown 버그 수정 / 찌르기 모션 분리 / 플레이어 투명도 / 가드 chest 중심 복원 |
| **7** | **Jam-prep balance + camera/visual sync**: (a) 카메라 정중앙 뒤+살짝 위, useFrame Z lerp 추격 (b) 검·가드 fighter group worldZ에 lock, raycast plane도 player Z로 이동 (c) `tradeImmune` 비주얼 플래그 — 투명화는 stun/iframe 시에만 해제 (d) `attackerFollowFraction` 1.0 + `FRICTION` 5.0 → 거리 보존 + 빠른 가감속 (e) `commitPending` motion gate — 이동 중 입력 거부 (f) 넉백 위계 재설정 (slice 8 / counter 10 / thrust 14) — slice<counter<thrust (g) thrust block에도 stun 적용 (h) `stunMs` 1500 + 피격 시 즉시 해제 (i) `counterWindowMs` / `thrustBlockStunMs` → `stunMs` 단일 변수로 통합 (j) 스턴 시 머리 위 노란 별 2개 시각 인디케이터 |
| **8** | **Day 1 시각 P0 완료**: (a) `@react-three/postprocessing` 도입, Canvas에 `<EffectComposer><Bloom>` + ACESFilmic 톤매핑 (b) 검 emissive를 황색→시안(`#38bdf8`) 라이트세이버 톤으로 통일, intensity를 Bloom threshold 위로 상향(swing 3.4 피크) (c) drei `<Trail>` 검 끝 부착 — 0.22 width, 1.6s 길이, decay 3 (d) `ImpactEvent` 타입 + `impactEvents` ref를 `useDuelLoop`에 추가 (resolver outcome 발화시 push, miss/rejected 제외, 800ms prune), `ImpactRings` 컴포넌트가 outcome별 ring 렌더 (hit 노란빛 / pierce 핑크 / block 시안) + 카메라 셰이크 X·Y 오프셋 (e) `MatchState.lastRoundReason` 추가 — "ringout"일 때 `KoSplash` 132px headline + pop-in/settle/fade 애니메이션 (f) `Arena3D` 4-tier로 분리: 페데스탈 cylinder(`#8c7558`) → 내부 디스크(`#b59872`) → 외곽 림(`#4a3d2c`, RIM_LIFT=0.06) → 발광 페리미터 ring(`emissive #38bdf8`, `toneMapped: false`) (g) `Water.tsx` 신규 ShaderMaterial — 3-layer 변위(amp 0.06m) + 깊이 그라디언트 + 샤프 스파클(`pow(sp, 14)`) + 0.32m 쇼어라인 폼. 1차 시안에서 스파클 주파수 4.2(블롭)/쇼어 1.15m(과도) → 9.0/0.32m로 튜닝 |
| **11a** | **Cloudflare 랭크 백엔드 — 권위 룸 + state broadcast + CORS** (`worker/`, 28→30 tests passing): (a) `worker/` 워크스페이스 신설 (`@vibejam/worker`, dependsOn `@vibejam/shared`). `wrangler.toml`에 `RANKED_QUEUE`/`DUEL_ROOM` DO 바인딩 + `new_sqlite_classes` 마이그레이션 선언 (b) `index.ts` 라우터 — `/healthz`, `/leaderboard`(현재 stub), `/matchmake` (RankedQueue DO로 forward), `/rooms/:id` (DuelRoom DO로 forward), `OPTIONS` (corsPreflight) (c) `RankedQueue` DO — `parseMatchmakePlayer`로 hello payload 검증, `Math.abs(rating - waiting.rating) <= 200`인 첫 후보와 매치, 없으면 큐에 enqueue + `{status: "queued", queueSize}` 응답. 매치 시 `roomId = ranked-{a}-{b}` 발급 (d) `DuelRoom` DO — WebSocketPair upgrade, `state.storage.setAlarm(now + 33ms)`로 30Hz tick 스케줄. 메시지 string만 허용, close/error 시 detach (e) `DuelRoomSession` — fighters 양쪽 메모리 보유, hello로 사이드 자동 할당(player→opponent→room_full), ready 둘 다면 countdown 진입, attack 수신 시 `resolveAttack`/`applyOutcome` 호출 후 `impact` broadcast, fighting tick에서 `tickFighter`로 velX 적분 + ringout/timeout 체크. 매치 종료 시 `applyEloResult` (K=32)로 ratings 계산해서 matchOver payload에 포함 (f) **`state` 30Hz broadcast 추가** — `tick()` fighting 분기에서 `tickFighter` 후 `broadcastState(now)` → `{ t: "state", serverNow, player: {posX, velX, guard, stunUntil, attackCooldownUntil, counterUntil}, opponent: {...} }`. 클라가 상대 위치를 알 유일한 경로 (이동 입력 채널 없음 — outcome-driven movement 모델) (g) **CORS** — `http.ts`의 `json()`이 모든 응답에 `Access-Control-Allow-Origin: *` + methods/headers 부착, `corsPreflight()` 헬퍼로 OPTIONS 204 응답 (h) 테스트 30/30 — rating 단위, RankedQueue 매칭/거절, DuelRoom 매치 라이프사이클(hello/ready/guard/attack/ringout/timeout/match_over), state broadcast 검증, CORS 헤더 검증 |
| **11.5** | **Sparks 파티클** (`docs/jam-polish-plan.md` §11.5, `claudedocs/research_impact_feedback_20260429.md` §3.1.6): (a) `client/src/duel/SparkParticles.tsx` 신설 — `THREE.Points` + 커스텀 `ShaderMaterial`. POOL_SIZE 256개 슬롯 ring-buffer, 각 슬롯 attribute = `position`(origin) + `aVelocity` + `aStartTime` + `aLifetime` + `aColor` + `aSize` (b) 버텍스 셰이더 GPU 적분: `pos = position + aVelocity * t + 0.5 * uGravity * t²`, `t = uTime - aStartTime`. CPU는 emit 시점에 1회만 attribute write, 이후 재생은 GPU 전용. `gl_PointSize = aSize * (1 - vAge) * (300/-z)`로 거리 보정 + 페이드 (c) 프래그먼트: 부드러운 디스크 (`smoothstep(0.42, 0.5, r)`) + 핫 코어 글로우 (중심 +0.5×). `AdditiveBlending` + `depthWrite: false` (d) **Kind별 burst** (`CONFIGS`): BLOCK 시안 10발 (speed 2.0–3.6, gravity 0.8, lifetime 0.55s, upBias 0.4) / HIT 마젠타 9발 (2.6–4.2, 1.4, 0.7s, 0.55) / PIERCE 오렌지(60%)+그레이 cloth(40%) 15발 (2.4–5.0, 1.1, 0.85s, 0.45) / KO 흰(50%)+마젠타(50%) 30발 (3.5–7.0, 0.5, 1.1s, 0.25 — 폭발에 가까운 풀-구) (e) Bloom 통과: 컬러를 `boost` 배수(1.1–2.4)로 곱해 luminance 0.85 임계 위로 끌어올려 검 emissive와 같은 글로우 파이프라인 사용 (f) `useImpacts.events` 구독 — `id` monotonically increasing이라 `lastEmittedId.current` 비교만으로 새 이벤트 검출 (zustand prune 시에도 false positive 없음) (g) `frustumCulled={false}` + 큰 boundingSphere — 카메라 앵글이 좁아도 슬롯 culling으로 사라지지 않음 |
| **11c** | **퍼시스턴스 + 리더보드 DO** (`docs/jam-polish-plan.md` §11c, `docs/ranked-multiplayer-cloudflare.md` §"저장소 선택"): (a) `worker/src/leaderboard.ts` 신설 — `Leaderboard` Durable Object. `state.storage.put/get/list` (KV 인터페이스, `new_sqlite_classes = ["Leaderboard"]` 마이그레이션 v2 선언으로 SQLite-backed). 키 = `p:{playerId}`, 값 = `{playerId, name, rating, wins, losses, draws, updatedAt}` (b) 라우트: `GET /leaderboard` → Top 20 (rating desc, tiebreak updatedAt desc → playerId asc), `GET /me?playerId=X` → 단일 행 또는 null, `POST /result` (internal) → 양쪽 upsert + W/L/D 누산. playerId ≤64자 / name ≤24자 sanitise (c) `wrangler.toml`에 `LEADERBOARD` 바인딩 + `[[migrations]] tag = "v2"` 추가. `bindings.ts`에 `LEADERBOARD?: DurableObjectNamespace` (optional — 미바인딩 시 `/leaderboard` 500) (d) `worker/src/duel-session.ts`에 `MatchOverEvent` 인터페이스 + `DuelRoomSessionOptions.onMatchOver` 콜백. `endMatch`가 `applyEloResult` 결과 + 양쪽 outcome("win"/"loss")로 콜백 발화 (양쪽 hello 완료 시에만 — ratings != null 가드) (e) `worker/src/duel-room.ts`에 `LeaderboardEnv` 타입, DuelRoom DO가 env retain하고 session 생성 시 `onMatchOver` 와이어. 콜백은 fire-and-forget으로 LEADERBOARD DO에 internal `POST /result` 송신 (실패해도 매치 종료 broadcast가 막히면 안 됨 → try/catch 무음 처리) (f) `worker/src/index.ts`에 `/leaderboard`, `/me` 라우트 추가 — 둘 다 `GLOBAL_LEADERBOARD_NAME = "global"`로 forward (g) **클라**: `client/src/duel/network/leaderboard.ts` (`fetchLeaderboard` / `fetchMe`), `client/src/duel/LeaderboardView.tsx` (Top 20 테이블 + 내 기록 row + 에러/빈 상태). `TitleScreen`에 옵셔널 `onShowLeaderboard` prop + "View Leaderboard" 버튼. `Duel` 루트에 `showLeaderboard` 상태 추가 (h) **테스트**: `worker/test/leaderboard.test.js` 신설 (in-memory storage mock — Map 백, `get/put/list` 구현), upsert / W/L/D 누산 / 드로우 / Top 20 정렬 / sanitise / 404+400 검증. `duel-session.test.js`에 `onMatchOver` 콜백 페이로드 검증 추가. `http.test.js`에 LEADERBOARD stub 추가 + `/leaderboard`, `/me` 라우팅 검증 + 미바인딩 500 검증. **30 → 42 tests** |
| **11b** | **클라 네트워크 어댑터** (`docs/jam-polish-plan.md` §11b, `docs/ranked-multiplayer-cloudflare.md`): (a) `client/src/duel/network/` 신설 — `types.ts` (`ServerMessage`/`ClientMessage` 와이어 프로토콜, worker `duel-session.ts`와 1:1 매칭), `matchmake.ts` (`postMatchmake` + `pollUntilMatched` 2초 간격 큐 폴링, `getOrCreatePlayerId`로 `localStorage["chambara.playerId"]` 16바이트 hex 발급, `readStoredRating`/`writeStoredRating`으로 `localStorage["chambara.rating"]` 영속화, default 1000), `RankedClient.ts` (브라우저 WebSocket 래퍼 — open 전 outbox 버퍼링, JSON parse, 자동 재접속 X) (b) `useRankedMatch` 훅 신설 — `UseDuelLoop`과 같은 shape 반환해서 `Duel.tsx`의 GameStage가 솔로/랭크 동일 코드로 렌더 가능. server `state` 메시지의 `player`/`opponent` 라벨이 우리 `ourSide` (서버 할당)에 따라 좌우 반전될 수 있어 mirror 처리해서 `playerVisual`이 항상 *우리* 파이터를 가리킴 (c) `state` 메시지 30Hz → posX/velX/guard/stunUntil/attackCooldownUntil 받아 `playerVisual.worldZ`를 lerp(target, 0.32)로 보간 (raw teleport 방지). 서버 클럭 추적 (`lastServerNow + (now - lastServerNowAt)`)으로 stun/cooldown remainingMs 산출 (d) `impact` 메시지 → `dispatchImpactFx(kind, ctx)` 직결 (Phase 10a 통합 포인트). attackerSide → `attackerIsPlayer` 변환, defender 위치는 최신 state 스냅샷에서 읽음 (e) 입력 송신: `setPlayerGuard`는 ~30Hz 스로틀(`GUARD_SEND_INTERVAL_MS=33`)로 `{ t: "guard", guard }` 송신 + 로컬 visual은 즉시 반영. `handlePlayerAttack`은 `mouseToAttackEvent` 빌드 후 `{ t: "attack", event, now }` 송신 + **로컬 옵티미스틱 `AttackVisualState`** 셋팅 (검 휘두르는 모션이 서버 라운드트립 없이 즉시 보임). 상대방의 wind-up 애니메이션은 서버 telegraph 메시지 부재로 미구현 (Phase 11.5 후보) (f) 매치 라이프사이클: WS open → `hello` 송신 → 서버 hello 수신 시 `ourSide`/rating 저장 후 `ready` 자동 송신. `match_state`/`round_over`/`match_over` 이벤트로 `MatchState` 미러 갱신 (HUD가 그대로 읽음). `match_over` 시 `ratings.{player,opponent}.after`에서 *우리* rating만 추출해 `writeStoredRating`으로 영속화 (g) `TitleScreen`에 **모드 토글** — 기존 "Start Duel" 단일 버튼을 "Solo (vs AI)" / "Ranked Online" 2개로 분리. `Identity.mode` 필드는 세션마다 새로 선택(persist X). `Duel` 루트 컴포넌트가 `identity.mode === "ranked"` 분기로 `RankedDuelGame` vs `DuelGame` 마운트 (h) `RankedOverlay` 컴포넌트 — `summary.status` 따라 "FINDING DUELIST"/"IN QUEUE"/"MATCH FOUND"/"VICTORY/DEFEAT" 디스플레이 + Cancel 버튼. `in_match` 상태에서만 사라짐. `match_over` 시 rating delta(`+/-N`) 표시. (i) `GameStage`에 `aiEnabled` prop 추가 — 솔로는 true(기존 AI tick 유지), 랭크는 false(서버가 상대 운영). 모든 `setOpponentGuard`/`handleOpponentAttack`은 `useRankedMatch`에서 no-op으로 stub 처리해도 GameStage가 호출 안 함 (j) `VITE_WORKER_URL` 환경변수 추가 (`vite-env.d.ts`) — 미설정 시 `http://localhost:8787` (wrangler dev) 폴백 |
| **10a** | **디스패처 인프라** (`docs/jam-polish-plan.md` §10a, `claudedocs/research_impact_feedback_20260429.md` §1 위계 일관성 원칙): (a) `client/src/duel/stores/` 신설 — `useImpacts`(`ImpactKind = "hit"\|"pierce"\|"block"\|"ko"`, push/prune/clear), `useShake`(Eiserloh 트라우마 모델, `add(t)` 캡 1.0 / `decay(dt)` 1.4/sec linear), `useFlash`(startAt/endAt/peak 추적 envelope, `pulse(durationMs, intensity, now)`로 더 긴 envelope·더 큰 peak는 절대 truncate 하지 않음), `useTimeScale` (Phase 10b 참조) (b) `dispatchImpactFx(kind, ctx)` 단일 진입점 신설 (`client/src/duel/dispatchImpactFx.ts`) — `FX_TABLE`로 outcome별 trauma/hitstopMs/flash/vibrate 정의, ring·shake·time·flash·vibrate 5축을 ±1 프레임 동시 발화. KO는 `slowmoKo()` 분기, 외엔 `hitstop(ms)`. BLOCK flash=null (WCAG 3-flash/sec 회피, research §3.1.5) (c) `useDuelLoop`에서 ref 기반 `impactEvents` 큐 제거 → resolver outcome 발화 시 `dispatchImpactFx(outcome.kind, ctx)` 직접 호출. ringout 감지 시 `dispatchImpactFx("ko", ctx)`로 KO 슬로모 + 강한 셰이크 (d) `ImpactRings`가 props 대신 `useImpacts` 스토어 직접 구독 (e) Phase 11b에서 서버 `impact` 메시지 수신 시 동일 `dispatchImpactFx(kind, ctx)`만 호출하면 클라/서버 outcome이 같은 5축 FX로 통합됨 (네트워크 어댑터 통합 포인트) |
| **10b** | **시간/공간 효과** (`docs/jam-polish-plan.md` §10b, `claudedocs/research_impact_feedback_20260429.md` §3.4·§3.5): (a) `useTimeScale` 스토어 — `hitstop(ms, now)` (envelope 절대 truncate 안 함, FREEZE_SCALE=0.05 = 거의 정지), `slowmoKo(now)` (350ms freeze → 650ms hold @ 0.25× → 200ms cubic ease-out → 1.0×), `tick(now)`로 phase 진행 (b) `useFrame`에서 `tick()` 호출 후 `scale` 읽어 `duel.tick(dt * scale, now)` — 게임 로직만 스케일, VFX(rings/post-FX/flash 디케이)는 raw dt 유지하여 freeze 순간이 시각적으로 드러남 (c) trauma-driven post-FX — 프레임마다 `useShake.decay(dt)` (raw dt, hit-stop에 stuck 안 됨) → `trauma²` 카메라 셰이크(amplitude 0.18). `ChromaticAberration.offset = max(0, trauma - 0.25) * 0.011`로 BLOCK trauma 0.20을 컷오프 아래에 두어 BLOCK CA 펄스 차단 (research §2.1 BLOCK CA = none). `Vignette.darkness = 0.4 + max(0, trauma - 0.7) * 1.3`으로 KO trauma 0.85만 vignette 스파이크 (d) `FullScreenFlash` CSS 오버레이(zIndex 40, mix-blend-mode screen, pointer-events none) — `useFlash.amount` 100Hz 폴링, R3F canvas 위 별도 layer라 추가 render-target 비용 0. HIT 16ms@0.45 / PIERCE 33ms@0.6 / KO 50ms@0.85 (e) `navigator.vibrate` Android 햅틱 — feature-detect, BLOCK [40,30,40] / HIT [80] / PIERCE [20,20,80] / KO [200,100,400]. iOS Safari는 `vibrate` 미구현 → silent no-op (Phase 9 audio sub-bass로 대체 예정, research §3.3.1) (f) Phase 11b 통합 포인트: 서버 `impact` 브로드캐스트만 받으면 본 envelope이 클라이언트별로 자동 작동 — 서버는 outcome kind만 알면 됨 |
| **9.5** | **Identity & IP polish** (Phase 9.5a~e — `docs/jam-polish-plan.md` §1, `claudedocs/research_character_weapon_customization_20260429.md`): (a) `BASIC_SWORD` → **`PLASMA_BLADE`** 리네임 (Lucasfilm 트레이드마크 회피, 코드 식별자만 — `swordRef`/`SwordPose` 등 내부 식별자 유지). 영향: `weapons.ts`, `useDuelLoop.ts`, `Duel.tsx`, `InputDemo.tsx`, `shared/src/combat/CLAUDE.md` (b) `Fighter`에 **`accentColor` prop** 추가, 단일 hex로부터 HSL slide로 4-stop 팔레트 (core/bright/dim/guard) derive. 모든 sword pose의 emissive를 팔레트 기준으로 분기. drei `<Trail>` color도 사이드별 (c) **Body/Head Fresnel rim 셰이더** — `MeshStandardMaterial.onBeforeCompile`로 outgoingLight에 `pow(1-dot(viewDir, normal), 2.6) * 1.6 * uRimColor` 추가. uniform mutation으로 Phase 9.5d 색 변경 시 셰이더 재컴파일 X (d) **player bodyColor 중립화** — `#3b82f6`/`#ef4444` → `#64748b` 양쪽 동일. 사이드 ID는 블레이드 emissive + rim에만 (research §3.3) (e) **`TitleScreen.tsx`** 신규 — 이름 입력(≤16자) + 5 세이버 색 프리셋(시안/그린/퍼플/마젠타/옐로우, 빨강 제외 IP §7.4) + `localStorage["chambara.name"]`/`["chambara.saber"]` 저장. `readStoredIdentity()` helper로 두 값 모두 있으면 타이틀 스킵, Duel.tsx top-level이 게이트 (f) **`DuelHud` props 확장** — `playerName/Accent`, `opponentName/Accent` 추가. TopBar 좌우 NameTag (`text-shadow: 0 0 8px {accent}`) + FlagDots 색을 사이드 accent 매칭. KoSplash subline `<player> knocked out <opponent>` 형식, accent 색도 사이드별. matchOver 화면에 winnerName 표시. **Opponent는 "AI Bot" 고정** (Phase 11 서버에서 실제 이름 송신 시 교체) (g) **넉백 -25% 튠** (사용자 피드백 "넉백이 너무 큼"): `sliceKnockback` 8.0→6.0, `counterKnockback` 10.0→7.5, `thrustKnockback` 14.0→10.5. 변위 1.6/2.0/2.8 → 1.2/1.5/2.1. thrust 1히트 KO 페이스 → 2-3히트, slice 5히트 → 6-7히트. Switch Sports 원작 페이스에 더 가까움. (h) **Thrust 히트 판정 버그 수정** (사용자 피드백 "thrust가 대부분 miss"): `mouseToAttackEvent`의 thrust event.origin이 마우스 위치 → segment가 body 실루엣 밖에서 시작해 더 멀리 뻗어 거의 항상 MISS였음. `event.origin = (0, SHOULDER_Y)` (chest, body box 내부)로 변경 + len=0 폴백 (forward-up). 비주얼은 이미 chest 기준이라 변경 불필요. AI의 `pickThrust`는 origin을 박스 외부에 두고 박스를 통과하도록 segment 구성하는 패턴이라 영향 없음. `InputDemo`의 동일 패턴도 함께 수정. |

각 phase는 typecheck + build 통과 후 다음으로 진행. 브라우저 시각 검증은 `yarn dev:client` 후 직접 수행 필요.

---

## 10. 참조

- [`docs/game-design.md`](./game-design.md) — 컨셉 / 메카닉 / 입력 모델 디자인 로그
- [`docs/architecture.md`](./architecture.md) — 인프라 (R3F / Colyseus 레거시)
- [`docs/ranked-multiplayer-cloudflare.md`](./ranked-multiplayer-cloudflare.md) — 랭크 1v1 Cloudflare 서버/배포 전략
- [`docs/setup.md`](./setup.md) — 개발 환경
- [`claudedocs/research_chambara_20260428.md`](../claudedocs/research_chambara_20260428.md) — Switch Sports Chambara 메카닉 리서치 보고서
- [`claudedocs/research_chambara_visuals_20260429.md`](../claudedocs/research_chambara_visuals_20260429.md) — 시각 처리 리서치 (R3F + Bloom + 라이트세이버 톤)
- [`claudedocs/research_impact_feedback_20260429.md`](../claudedocs/research_impact_feedback_20260429.md) — 타격감 5축 리서치 (시각·청각·햅틱·시간·공간) — Phase 9/10 폴리시 근거
- [`claudedocs/research_character_weapon_customization_20260429.md`](../claudedocs/research_character_weapon_customization_20260429.md) — 캐릭터·무기·커스터마이징 + IP-안전 네이밍 — Phase 9.5/12 근거
- [`docs/jam-polish-plan.md`](./jam-polish-plan.md) — Phase 8 이후 폴리시 작업 큐 + 사용자 에셋 수집 가이드
- `docs/references/chambara-ref-{1,2,3}.{webp,jpg}` — Switch Sports 챔버라 스크린샷 (카메라 앵글, 검 글로우, 스턴 별 인디케이터 레퍼런스)
