# Chambara Duel — Implementation Reference

> 마지막 업데이트: 2026-04-29 (Phase 7 — jam-prep balance + visual sync)
>
> `docs/game-design.md`가 *컨셉/요구사항* 문서라면 본 문서는 *현재 빌드된 시스템*의 레퍼런스.
> 파일 경로, 책임 분리, 룰 → 코드 매핑, 튜닝 노브, 미해결 항목 정리.

---

## 1. 시스템 구조

```
shared/src/combat/      # 클라/서버 공유 — 결정론적 순수 로직 (랭크 게임 대비)
  types.ts              # Vec2, FighterState, GuardSnapshot, AttackEvent, Outcome, WeaponStats
  geometry.ts           # 선분/박스 교차, 두 선의 예각
  weapons.ts            # BASIC_SWORD 디폴트 + 확장 포인트
  resolver.ts           # resolveAttack / applyOutcome / tickFighter
  index.ts              # 배럴 익스포트 (`@vibejam/shared`로 노출)

client/src/duel/        # 게임 클라이언트 (3D 렌더 + 입력 + 매치 진행)
  Duel.tsx              # 디폴트 라우트 `/`. Canvas + GameStage + HUD + Debug 토글
  Arena3D.tsx           # 원형 발판 + 물 + 조명/하늘
  Fighter.tsx           # 캐릭터 + 검 (단일 segment, phase-based 포즈)
  useDuelLoop.ts        # 매치 상태머신, pendingAttack, 가드 빌더, 물리 tick
  useMouseInput.ts      # drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드
  ai.ts                 # 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice)
  DuelHud.tsx           # 라운드 점수/타이머/카운트다운 오버레이/스턴 바
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

### 넉백 — slice < counter < thrust 위계
- `sliceKnockback` (8.0) — per-hit 변위 = 8.0/FRICTION = **1.6 unit**
- `counterKnockback` (10.0) — 가드 후 윈도우 안 공격 시 보너스. 슬라이스보다 살짝 위 (변위 2.0). 가드 측의 보상.
- `thrustKnockback` (14.0) — 가장 어려움 (어떤 가드든 막힘) → 가장 높은 보상. 변위 2.8 → 시작 ±1.6에서 1히트 KO.
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

### 시각 시그니처 (잼 P0)
- [x] **카메라 앵글** — 캐릭터 바로 뒤+살짝 위 + Z lerp 추격 (Phase 7 완료)
- [ ] **postprocessing + Bloom** — selective bloom (luminanceThreshold 1.0)으로 emissive HDR 검 발광
- [ ] **검 emissive 라이트세이버 톤** — 시안 코어 + 화이트 글로우 (idle 0, guard 1.5+, swing 4.0)
- [ ] **검 트레일** — drei `<Trail>` 또는 meshline. 마우스 스윙 가시화
- [ ] **임팩트 링/셰이크** — `?demo=arena`의 BLOCK/HIT 링 메인 Duel로 포팅 + 카메라 셰이크
- [ ] **KO splash + 콜로세움 외곽 링 분리** — 발판을 외곽/중앙 두 mesh로 분리. 낙하 시 RingGeometry 펄스
- [ ] **Stylized water shader** — 단색 plane → 카툰 물 (thaslle/stylized-water 또는 직접)

### 게임플레이
- [ ] **AI 시드 RNG** — `Math.random` 대체. 랭크 리플레이/네트코드 결정론 필수
- [ ] **4라운드 서든데스** — 좁은 발판 + 2히트 KO (chambara 원작)
- [ ] **플레이어 이동** — 현재는 넉백으로만 위치 변화. WASD 이동? 아니면 의도적으로 X
- [ ] **무기 종류** — 차지 검 / 쌍검 / Timely Block (현재 BASIC_SWORD 1종)

### 멀티플레이 / 랭크 (Day 2)
- [ ] **사설방 (Colyseus DuelRoom)** — `server/src/rooms/GameRoom`을 `DuelRoom`으로 리팩토링. shared resolver 재사용. 사설방 코드 생성/입장.
- [ ] **권위 서버 모델** — 클라는 입력만 송신, 서버가 resolveAttack, 결과 브로드캐스트
- [ ] **랭크 / MMR** — 단순 ELO (K=32) + 점수 ±200 큐. SQLite 또는 in-memory.
- [ ] **임팩트 시점 동기화** — 네트워크 지연 보상

### 배포 / 컴플라이언스
- [ ] **Vercel 배포** (client static + 서버는 Render/Railway — Colyseus는 serverless 부적합)
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

각 phase는 typecheck + build 통과 후 다음으로 진행. 브라우저 시각 검증은 `yarn dev:client` 후 직접 수행 필요.

---

## 10. 참조

- [`docs/game-design.md`](./game-design.md) — 컨셉 / 메카닉 / 입력 모델 디자인 로그
- [`docs/architecture.md`](./architecture.md) — 인프라 (R3F / Colyseus)
- [`docs/setup.md`](./setup.md) — 개발 환경
- [`claudedocs/research_chambara_20260428.md`](../claudedocs/research_chambara_20260428.md) — Switch Sports Chambara 메카닉 리서치 보고서
- [`claudedocs/research_chambara_visuals_20260429.md`](../claudedocs/research_chambara_visuals_20260429.md) — 시각 처리 리서치 (R3F + Bloom + 라이트세이버 톤)
- [`docs/예시 이미지1.webp`](./예시 이미지1.webp) / [`이미지2.jpg`](./예시 이미지2.jpg) / [`이미지3.jpg`](./예시 이미지3.jpg) — Switch Sports 챔버라 스크린샷 (카메라 앵글, 검 글로우, 스턴 별 인디케이터 레퍼런스)
