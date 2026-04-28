# Chambara Duel — Implementation Reference

> 마지막 업데이트: 2026-04-29
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
- Player at world `(0, 0, -1.6)`, faces +Z
- Opponent at world `(0, 0, +1.6)`, faces -Z
- Camera over-the-shoulder of player: `(0.6, 1.95, -3.1)` looking at `(0, 1.0, 0.4)`
- 마우스 → blade plane Z=0 raycast → `(x, y)` 추출 (`Duel.GameStage.toWorld`)

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

---

## 4. 전투 모델 디테일

### 4.1 공격 라이프사이클 (pendingAttack)

```
input  →  windUp (windUpMs)  →  impact (resolver 발동)  →  swing (swingDurationMs)  →  recovery → ready
T=0       T=0..280               T=280                      T=280..400                T=400..600
```

- **input**: 마우스 입력 → `handlePlayerAttack` / `handleOpponentAttack` → `commitPending`
  - 거절 조건: `now < attackCooldownUntil`, `now < stunUntil`, 이미 pending 존재
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
     - defender 가드 활성  →  BLOCK (각도 무관, 넉백 없음)
     - 무방비  →  HIT (counter 활성 시 counterKnockback)
6. kind === "slice":
     - 가드 비활성 또는 가드가 슬라이스 경로와 교차 X  →  HIT
     - 가드 교차 + 각도가 ⊥ ± guardAngleTolerance  →  BLOCK + STUN
     - 가드 교차 + 평행쪽  →  PIERCE (HIT 통과)
```

### 4.5 결과 적용 (`resolver.applyOutcome`)

| 발동 조건 | 처리 |
|---|---|
| 항상 (rejected 아니면) | `attackCooldownUntil = max(기존, now + attackCooldownMs)` (`Math.max`로 commitPending이 설정한 input-anchor cooldown 보존) |
| `hit` / `pierce` | `counterUntil = 0` (보너스 소비), `tradeImmuneUntil = now + tradeImmuneMs` |
| `block` | `attackerStun > 0` → 공격자 stun, `defenderCounterWindow > 0` → 방어자에게 counter window |
| `knockback > 0` | `defender.velX += facing * knockback`, `attacker.velX += facing * knockback * attackerFollowFraction` |

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

## 7. WeaponStats 튜닝 노브 (16개)

D키로 디버그 패널 열어서 실시간 슬라이더 조정 가능.

### 넉백
- `sliceKnockback` (기본 3.0)
- `thrustKnockback` (5.0)
- `counterKnockback` (7.0)
- `attackerFollowFraction` (0.5) — push-along 비율

### 타이밍
- `attackCooldownMs` (600) — input → 다음 input 가능까지
- `windUpMs` (280) — slice 텔레그래프
- `thrustChargeMs` (280) — thrust 텔레그래프
- `swingDurationMs` (120) — swing 시각 시간
- `stunMs` (800) — perpendicular block 시 공격자 stun
- `counterWindowMs` (600) — block 후 카운터 보너스 시간
- `tradeImmuneMs` (250) — 적중 후 retaliation 방지 grace

### 판정
- `guardAngleTolerance` (30°) — perpendicular 허용폭
- `motionImmunityVelocityThreshold` (1.0) — 이상 속도면 양쪽 공격 무효

### 형상
- `bladeLength` (1.2) — 검 segment 길이 = 가드 segment 길이
- `thrustReach` (1.4) — 찌르기 추가 reach
- `minSliceReach` (0.35) — 슬라이스 최소 드래그 거리 (탭 무시)

---

## 8. 미해결 / 다음 단계

### 게임플레이
- [ ] **AI 시드 RNG** — `Math.random` 대체. 랭크 리플레이/네트코드 결정론 필수
- [ ] **4라운드 서든데스** — 좁은 발판 + 2히트 KO (chambara 원작)
- [ ] **플레이어 이동** — 현재는 넉백으로만 위치 변화. WASD 이동? 아니면 의도적으로 X
- [ ] **무기 종류** — 차지 검 / 쌍검 / Timely Block (현재 BASIC_SWORD 1종)

### 멀티플레이 / 랭크
- [ ] **Colyseus 멀티** — `server/src/rooms/GameRoom`을 `DuelRoom`으로 리팩토링. shared의 resolver 재사용
- [ ] **권위 서버 모델** — 클라는 입력 송신, 서버가 resolveAttack, 결과 브로드캐스트
- [ ] **MMR / 매치메이킹** — 랭크 시스템

### 컨텐츠
- [ ] **캐릭터 메시** — 현재 box+sphere placeholder. Soldier.glb / Tripo3D / Quaternius 결정 필요
- [ ] **사운드** — 충돌/스윙/넉백 SFX 0
- [ ] **VFX** — 임팩트 파티클, 가드 충돌 스파크 등

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

각 phase는 typecheck + build 통과 후 다음으로 진행. 브라우저 시각 검증은 `yarn dev:client` 후 직접 수행 필요.

---

## 10. 참조

- [`docs/game-design.md`](./game-design.md) — 컨셉 / 메카닉 / 입력 모델 디자인 로그
- [`docs/architecture.md`](./architecture.md) — 인프라 (R3F / Colyseus)
- [`docs/setup.md`](./setup.md) — 개발 환경
- [`claudedocs/research_chambara_20260428.md`](../claudedocs/research_chambara_20260428.md) — Switch Sports Chambara 메카닉 리서치 보고서
