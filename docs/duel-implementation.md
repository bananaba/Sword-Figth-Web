# Chambara Duel — Implementation Reference

> 마지막 업데이트: 2026-04-30 (Phase 16 — 3 sword presets(BASIC/CHARGE/RAPIER) + character/weapon picker, per-weapon slice/thrust impact·cooldown 분리, 솔로 봇 매치 룰을 권위 서버와 동일 수치(`ARENA_RADIUS=4.0`, INITIAL_*POS=±1.0)로 정렬, 옵저버용 `blade-tip-predictor`(서버 30Hz 스냅샷 사이 보간/예측), 랭크 상대 abandonment 감지 → 자동 matchOver, 가드 lean 가변 disc, 스턴 별 head bone tracking, 사전-KO 슬로모 인프라(현재 비활성). Phase 13 라이브 배포는 그대로 유효: Cloudflare Workers `chambara-ranked-worker.200tiger1.workers.dev` + Pages `chambara-duel.pages.dev`)
>
> `docs/game-design.md`가 *컨셉/요구사항* 문서라면 본 문서는 *현재 빌드된 시스템*의 레퍼런스.
> 파일 경로, 책임 분리, 룰 → 코드 매핑, 튜닝 노브, 미해결 항목 정리.
>
> **플랫폼 / 입력**: PC 1차, **마우스 전용** (키보드 미사용). 좌클릭 슬라이스 / 휠클릭 또는 더블 클릭 찌르기 / 우클릭 가드. 모바일 입력 코드(`useSwordInput.ts`의 자이로/터치)는 `?demo=sword`에서만 활성 — 메인 `/` 라우트는 PC 마우스 입력만. 모바일 호환은 P2 폴리시. (D키는 개발자 전용 debug panel 토글로 게임플레이 입력에 포함 안 됨.)

---

## 1. 시스템 구조

```
shared/src/combat/      # 클라/서버 공유 — 결정론적 순수 로직 (랭크 게임 대비)
  types.ts              # Vec2, FighterState, GuardSnapshot, AttackEvent, Outcome, WeaponStats, WeaponId
  geometry.ts           # 선분/박스 교차, 두 선의 예각
  weapons.ts            # 3 프리셋 (BASIC_SWORD / CHARGE_SWORD / RAPIER) + WEAPON_PRESETS + getWeaponPreset(id) (Phase 16, IP-안전 네이밍은 Phase 9.5에서 도입). PLASMA_BLADE는 BASIC_SWORD 별칭 (worker 후방 호환)
  arena.ts              # ARENA_RADIUS=4.0, INITIAL_PLAYER_POS=-1.0, INITIAL_OPPONENT_POS=1.0 — 클라 렌더/솔로 ringout/서버 ringout이 동일 값 공유 (Phase 16, ca027c8 — 시각 림과 서버 ringout 불일치 방지)
  blade-tip-predictor.ts# 서버 30Hz 스냅샷 사이 옵저버 측 blade tip 보간/짧은 lead 예측. snapshot/frame 입력 모드, maxLead 0.08s/0.42 unit 클램프 (Phase 16, 9701b44)
  resolver.ts           # resolveAttack / applyOutcome / tickFighter
  index.ts              # 배럴 익스포트 (`@vibejam/shared`로 노출)

client/src/duel/        # 게임 클라이언트 (3D 렌더 + 입력 + 매치 진행)
  Duel.tsx              # 디폴트 라우트 `/`. Canvas + Bloom + GameStage + HUD + 카메라 셰이크
  Arena3D.tsx           # 발판 (페데스탈/내부 디스크/외곽 림/발광 페리미터) + 조명/하늘
  Spikes.tsx            # 챔바라 가시 함정 — Water 폐기 후 대체 (Phase 16+, drei Instances ×2 + 결정론 분포)

worker/src/            # Cloudflare Worker + Durable Objects 권위 랭크 서버 (Phase 11a-c/11.6)
  index.ts              # 라우터: /healthz, /leaderboard, /me, /matchmake, /rooms/:id, OPTIONS preflight
  http.ts               # json() + corsPreflight() — 응답에 CORS 헤더 강제 부착
  bindings.ts           # Env 인터페이스 (RANKED_QUEUE, DUEL_ROOM, LEADERBOARD)
  protocol.ts           # MatchmakePlayer 타입 + parser
  rating.ts             # ELO K=32 expectedScore / applyEloResult
  ranked-queue.ts       # RankedQueue DO — storage-backed ±200 매칭, unique roomId 발급
  duel-room.ts          # DuelRoom DO — WS upgrade + alarm 기반 30Hz tick 스케줄
  duel-session.ts       # DuelRoomSession — hello/ready/guard/attack 핸들링 + 매치 상태머신 + state broadcast
  leaderboard.ts        # Leaderboard DO — rating/W-L-D persistence + Top 20
  test/*.test.js        # node:test (rating · queue · room · http · leaderboard · session abandonment) — `shared/test/blade-tip-predictor.test.js`까지 합쳐 회귀 가드 50+개
  Fighter.tsx           # xbot/ybot FBX + Mixamo 애니 + 검(grip/tip pose) + drei `<Trail>` + 스턴 별(head bone tracking) + 가드 lean(disc 가변) + 클립 timeScale 압축
  ImpactRings.tsx       # outcome 발화 시 확장 링 풀 (Phase 8) — useImpacts 스토어 구독
  TitleScreen.tsx       # 이름 + **캐릭터 픽커(Alpha/Beta — 모델 + 사이드 saberColor 번들)** + **무기 픽커(BASIC/CHARGE/RAPIER + blurb)** + Solo/Ranked 모드 토글. localStorage `chambara.character` / `chambara.weapon` 영속화 (Phase 16, 55b2613). 5 세이버 색 픽커는 폐기 — saberColor가 character preset에 묶임.
  useDuelLoop.ts        # 솔로 모드 매치 상태머신, pendingAttack, 가드, 물리 tick — outcome 시 dispatchImpactFx 호출. **권위 서버와 동일 룰 (`ARENA_RADIUS`/INITIAL_*POS) 사용** + 사전-KO 슬로모 hook(`predictKoPotential`, 현재 무효화 — Phase 16)
  useRankedMatch.ts     # 온라인 듀얼 어댑터 (Ranked/Private) — server state interpolation, **`createBladeTipPredictor`로 상대 검 끝 보간/예측**, impact → dispatchImpactFx, **상대 abandonment 감지 → 자동 matchOver**, 사전-KO 슬로모 hook(현재 무효화)
  predictKoPotential.ts # "이 일격이 링아웃 가능한가" 휴리스틱 — 근접 엣지(margin 1.0) OR worst-case knockback projection. 시각 슬로모용 prediction 전용 — resolver/서버 outcome에 영향 0 (Phase 16, 30a369b)
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
  DuelDebug.tsx         # D키 패널 — weapon stat 슬라이더 + 히트박스 와이어
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
- 마우스 → **player blade plane** raycast → `(x, y)` 추출 (`Duel.GameStage.toWorld`). 카메라가 추격하므로 raycast 평면도 함께 이동 → 마우스 게인 일정.
- idle 상태에서 마우스는 검 끝점이 아니라 **몸에서 마우스로 향하는 방향 입력**이다. `Fighter.tsx`가 body→mouse 연장선 위에 팔 길이로 도달 가능한 sword grip/tip을 만들고, xbot/ybot 팔 IK가 grip을 따라간다.
- idle 외 공격/피격/패배 authored animation 중에는 검이 right-hand bone 위치를 grip으로 사용한다. 검이 마우스를 직접 따라가지 않고 캐릭터 손에 들린 상태를 우선한다.

---

## 3. 룰 → 코드 매핑

### 3.1 사용자 초기 요구사항 (1차 7개)

| # | 요구사항 | 구현 위치 |
|---|---|---|
| 1 | 마우스만 컨트롤 (찌르기는 dbl/mid-click) | `useMouseInput.ts` |
| 2 | 공격이 상대 body 통과해야 적중 | `geometry.segmentIntersectsBox` |
| 3 | 공격간 쿨다운 (난타 방지) | `WeaponStats.attackCooldownMs` + duel loop |
| 4 | 카운터 슬라이스/찌르기 동일 넉백 | `resolver.resolveAttack` `counterActive ? counterKnockback : ...` |
| 5 | 무기 stat 확장 가능 | `WeaponStats` 필드, resolver는 weapon-agnostic |
| 6 | 방향 가드 (위/아래 별도) | `geometry.segmentsIntersect(slice, guard)` — 가드 위치 안 맞으면 통과 |
| 7 | 연속 각도 (4축 스냅 X) | `geometry.acuteAngleBetween` + `guardAngleTolerance` |
| 8 | 랭크 게임 대비 | resolver 순수함수 + 결정론, `shared/`에 배치 → 서버 권위/리플레이 호환 |

### 3.2 사용자 2차 피드백 (4개 — Phase 6a/b)

| # | 피드백 | 구현 위치 |
|---|---|---|
| 1 | 가드 = 마우스 벡터에 수직, 중앙(chest) 기준 | `useDuelLoop.buildPerpendicularGuard` |
| 2 | 푸시-얼롱 (공격자도 같은 방향으로 이동) | `resolver.applyOutcome` `attackerFollowFraction` |
| 3 | 이동 중 공격 무효 + 연속 공격 난타 방지 | `resolver.resolveAttack` motion 체크, `commitPending` cooldown/stun gate |
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
| 3 | 투명화는 완전 idle일 때만 적용 | `FighterVisualState.transparentWhenIdle`은 공격/가드/스턴/이동 중 해제 |
| 4 | 거리 일정 유지 + 이동 빠르게 + 이동 중 무적/공격불가 | `attackerFollowFraction` 0.5 → 1.0. `FRICTION` 2.5 → 5.0. `commitPending`에 motion gate 추가. resolver에 trade immunity는 이미 존재. |
| 5 | 슬라이스 < 카운터 < 찌르기 가치 위계 | sliceKnockback 8 (변위 1.6), counterKnockback 10 (변위 2.0), thrustKnockback 14 (변위 2.8). 5히트 안 KO 페이스. |
| 6 | 가드에 막히면 짧은 무력화 (공격·가드 모두 불가) | thrust block에도 stun 적용. resolver `event.kind === "thrust"` block에 `attackerStun: weapon.stunMs` 추가. |
| 7 | 스턴 표시 (예시 이미지 별 2개) | `Fighter.tsx`에 noddy yellow 5각 별 2개 메시. `stunGroupRef.current.visible = s.stunned`. 회전 + 보빙. |
| 8 | 스턴 시간 길게 + 피격 시 즉시 해제 | `stunMs` 800 → 1500. `applyOutcome`의 hit/pierce 분기에 `defender.stunUntil = 0` 추가. |
| 9 | 스턴 / 카운터 윈도우 / thrust block stun 변수 통합 | `WeaponStats`에서 `counterWindowMs` / `thrustBlockStunMs` 제거, `stunMs` 하나로 통합 (DRY + 안전). |

### 3.5 Phase 16 피드백 (per-weapon timing / 3 sword presets / 솔로 봇=서버 룰 정렬 / abandonment / blade tip prediction / pre-KO 슬로모)

| # | 피드백 | 수정 |
|---|---|---|
| 1 | 무기마다 다른 타이밍 (밸런스 다양성) | `WeaponStats`의 `windUpMs`/`thrustChargeMs`/`attackCooldownMs` 단일 값을 **`sliceImpactMs`/`thrustImpactMs`/`sliceCooldownMs`/`thrustCooldownMs` 4개로 분리** — 모든 프리셋이 4개 모두 명시. resolver/duel-loop은 attack kind에 따라 분기 (`commitPending`이 sliceImpactMs vs thrustImpactMs로 schedule, `applyOutcome`이 attackKind별 cooldown 적용). (d70f0a9, 707a96c) |
| 2 | 3개 무기 (Switch Sports처럼 캐릭터마다 다른 검) | `BASIC_SWORD` (균형) / `CHARGE_SWORD` (sliceK ↓3.0, counterK ↑7.5 — counter specialist) / `RAPIER` (sliceK ↓3.0, thrustK ↑9.0, thrustReach ↑1.7, thrustImpactMs ↓120, bladeLength ↑1.4 — thrust specialist). `WEAPON_PRESETS: Record<WeaponId, WeaponStats>` + `getWeaponPreset(id)` (BASIC fallback). (55b2613) |
| 3 | 캐릭터 + 무기 픽커 UI | TitleScreen에 `CharacterId = "alpha" \| "beta"` (Alpha=Y bot 시안, Beta=X bot 마젠타 — saberColor가 character에 묶임), `WeaponId` 픽커 카드 (label + blurb). 5 세이버 색 픽커는 폐기. localStorage `chambara.character` / `chambara.weapon` 영속화. (55b2613) |
| 4 | 솔로 봇 매치 룰을 권위 서버와 정렬 | `shared/src/combat/arena.ts` 신설 — `ARENA_RADIUS=4.0`, `INITIAL_PLAYER_POS=-1.0`, `INITIAL_OPPONENT_POS=1.0`. 클라 `Arena3D` 시각 림 / 솔로 `useDuelLoop` ringout / 서버 `duel-session` ringout 모두 같은 상수 import. 이전엔 시각 4.0 / 서버 4.2 차이로 fighters가 시각 림 밖에서 살아있는 케이스 발생. (ca027c8) |
| 5 | 찌르기 윈도우 단축 (Switch Sports 페이스) | `BASIC_SWORD.thrustImpactMs` 280 → 180, `thrustCooldownMs` 600 → 400. RAPIER는 더 짧음 (impact 120 / cooldown 400). (707a96c) |
| 6 | 옵저버 측 검 끝이 30Hz 스냅샷 사이 끊겨 보임 | `shared/src/combat/blade-tip-predictor.ts` 신설 — snapshot/frame 두 모드. snapshot 도착 시 `snapshotCorrection 0.85`로 rendered를 server tip 쪽으로 lerp + 두 스냅샷 사이 velocity 측정 (`maxSpeed 24` 클램프). frame tick에서 latest snapshot에 `min(age, maxLeadSeconds=0.08)`만큼 lead, `maxLeadDistance 0.42`로 클램프, exponential catch-up `rate=26`. `useRankedMatch`가 opponent blade tip wire에 적용. (9701b44) |
| 7 | 상대가 매치 중 disconnect → 화면 멈춤 | 서버 `duel-session.ts`에 forfeit-by-abandonment — `hello` 완료한 사이드의 WS가 매치 중 detach되면 남은 쪽이 "win"으로 즉시 matchOver broadcast + leaderboard 반영. 클라 `useRankedMatch`도 abandonment 메시지 핸들. (330a760, worker test 추가) |
| 8 | 스턴 별이 캐릭터 머리에서 분리되어 보임 | Phase 12까지는 `stunGroupRef.position.y = 1.85` 고정이었는데 Mixamo idle 클립이 머리를 약간 끄덕여서 별이 떠 있는 듯한 갭 발생. `Fighter.tsx`가 `mixamorigHead` bone을 찾아 매 프레임 `head.getWorldPosition` → group local로 변환해서 별 위치를 head bone에 부착. (360ad3f) |
| 9 | 가드가 chest 정중앙 회전이라 부자연스러움 | (Phase 15에서 시작) `leanedGuardSegment(guard, pointer)`가 segment center를 chest에서 pointer 방향으로 `min(\|pointer-chest\|, GUARD_LEAN_MAX_RADIUS=0.5)`만큼 이동. 마우스 거리에 따라 0~MAX **disc 안에서 자유 이동** (원 위가 아님). 78c34a3는 이걸 더 다듬음 — guard pose visual + 방향 인디케이터 개선. resolver는 segment 방향만 보므로 시각 lean이 perpendicularity 판정에 영향 0. |
| 10 | KO 직전 슬로모 hook 인프라 (현재 비활성) | `client/src/duel/predictKoPotential.ts` 신설 — `(attackerPosX, defenderPosX, weapon, arenaRadius)`로 "이 일격이 링아웃 가능한가" 휴리스틱. 두 predicate OR: (a) 디펜더가 `radius - 1.0` 안 (near edge) (b) max(slice/thrust/counter knockback)/FRICTION 거리만큼 push했을 때 `\|projected\| > radius`. `useTimeScale.koBuildup(ms, now)`이 구현됐고 `useDuelLoop`/`useRankedMatch`가 attack 시점 hook 와이어. **현재 발화 path는 비활성화** — Phase 17+에서 튜닝/활성화. (30a369b) |

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
- **windUp**: 공격 애니메이션 시작. 검은 손 bone을 grip으로 사용하고, 방향/트레일만 attack vector를 따른다.
- **impact**: `tick` 안에서 `now >= impactAt && !resolved` 시 `resolveAttack` 호출
- **swing**: `attack.start → attack.end` lerp, 노란 발광
- **recovery**: `attack.end → idle` lerp, 색상 normal

`Fighter.tsx`의 `currentSwordPose`가 idle phase의 sword direction/색상과 combat phase의 발광 상태를 결정한다. idle은 팔 IK가 grip을 따라가고, 공격/가드/피격/패배 중에는 authored animation의 right-hand bone 위치와 손목 회전이 검 grip/angle을 결정한다. 공격 중에는 가드 자동 비활성 (`setPlayerGuard` / `setOpponentGuard`이 pending 체크). 공격 FBX는 gameplay cooldown보다 길 수 있으므로 `Fighter.tsx`가 `slash`/`thrust` 클립 종료 시점까지 visual animation을 유지한다. 피격/링아웃은 즉시 interrupt 가능하다.

### 4.2 가드 모델

검 segment를 `chest ± perp(pointer) * (bladeLength / 2)`로 구성:
- `chest = (0, 1.15)` (player/AI 동일)
- `pointer = mouse position` (player) 또는 `chest + dir(angle) * 1` (AI)
- `perp = rotate90(normalize(pointer - chest))`

방향이 마우스 벡터에 수직 → "마우스가 가리키는 방향에서 들어오는 공격을 막는 자세".

**시각 lean** (Phase 15→16): resolver는 `tip - grip` 방향만 사용하고 segment의 위치는 검사하지 않는다(angle-only guard model). Phase 15에서는 segment center를 chest→pointer 방향으로 disc 안에서 가변 이동시키는 `leanedGuardSegment` 패턴을 썼고, **Phase 16(78c34a3)에서는 hand-position 기반으로 재구현** — `Fighter.tsx`의 `guardRightHandLocal(s, facing)`이 `s.bladeTipBladePlane - GRIP_2D` 단위 벡터로부터 right hand의 X(`±GUARD_HAND_SIDE_REACH = BODY_HALF_WIDTH * 0.5`)·Y(`[SHOULDER_Y - 0.26, SHOULDER_Y - 0.03]`)를 클램프해서 잡는다. left hand도 유사하게 chest 양쪽에 클램프되고 검은 두 손 사이 grip + Z `= GUARD_FORWARD_OFFSET = 0.51`로 chest 앞에 자리잡는다 → 마우스 방향으로 가드 자세가 자연스럽게 lean. pointer는 `s.bladeTipBladePlane` (player=마우스, opponent ranked=server-broadcast blade tip + `blade-tip-predictor` 보간, opponent solo=가드 segment tip fallback). 시각만 변경되고 perpendicularity 판정은 그대로 유지된다.

### 4.3 캐릭터 애니메이션 / 검 소유권

- **idle**: body/chest에서 마우스 방향과 거리를 얻고, 팔 reach 원과 검 길이 원의 조합으로 가능한 grip/tip을 계산한다. 마우스가 `|blade-arm|..blade+arm` 범위 안이면 검 끝은 마우스에 정확히 놓인다. 불가능하면 같은 body→mouse ray 위에서 가장 가까운 가능한 tip으로 clamp한다. FBX idle 클립 위에 간단한 two-bone IK를 얹어 양팔이 손잡이 두 지점을 따라간다.
- **attack**: 현재는 `slice` / `thrust` 1개씩 사용한다. 이후 공격 클립이 여러 개 들어오면 각 클립에 대표 방향 벡터를 부여하고, 입력 공격 방향과 내적이 가장 큰 클립을 선택한다.
- **hit / stun**: 새 피격 클립이 들어오면 impact 순간 hit reaction과 지속 stun loop/pose를 구분한다. 현재 `stunned`는 스턴 별과 임시 hit 클립 재생에 사용한다.
- **non-idle sword ownership**: 공격/가드/피격/패배 등 authored animation 중에는 검의 grip을 right-hand bone 위치에 두고, blade axis는 Mixamo right-hand local +Y(손가락/그립 방향)를 사용한다. 자연스러움은 손과 검의 결합 및 손목 각도가 우선이고, 마우스 tracking은 idle 방향 입력으로만 사용한다.

기존 phase-based 방향 계산은 유지한다:

```
slice:  start = atk.start (drag start)
        end   = atk.end   (drag end)
        효과: grip 중심으로 검 회전, tip이 호를 그림

thrust: start = chest + dir * 0.15  (당겨진 자세, 짧은 검)
        end   = chest + dir * (bladeLength + thrustReach)  (밀어내기 끝, 긴 검)
        효과: 판정/애니메이션 선택은 입력 방향을 따르되, 실제 렌더 검은 손 본의 위치/회전을 따른다
```

### 4.4 공격 판정 결정 트리 (`resolver.resolveAttack`)

```
1. now < attacker.stunUntil  →  REJECTED (스턴 중)
2. attack 경로가 defender body 통과 X  →  MISS
3. 어느 쪽이든 |velX| > motionImmunityVelocityThreshold  →  MISS (이동 중)
4. kind === "thrust":
     - defender 가드 활성  →  BLOCK + STUN (각도 무관, 넉백 없음, 공격자 stunMs 락아웃)
     - 무방비  →  HIT (counter 활성 시 counterKnockback)
5. kind === "slice":
     - 가드 비활성 또는 가드가 슬라이스 경로와 교차 X  →  HIT
     - 가드 교차 + 각도가 ⊥ ± guardAngleTolerance  →  BLOCK + STUN + 디펜더 카운터 윈도우
     - 가드 교차 + 평행쪽  →  PIERCE (HIT 통과)
```

**Phase 7 변경**: thrust block에 STUN 추가. slice block과 동일한 `stunMs` 락아웃을 공격자에 적용. 단 thrust block은 디펜더에게 **카운터 윈도우 부여 안 함** (각도 mind game이 아닌 단순 가드만 있으면 막혀서, 보상 차등).

### 4.5 결과 적용 (`resolver.applyOutcome`)

| 발동 조건 | 처리 |
|---|---|
| 항상 (rejected 아니면) | `attackCooldownUntil = max(기존, now + attackCooldownMs)` (`Math.max`로 commitPending이 설정한 input-anchor cooldown 보존) |
| `hit` / `pierce` | `counterUntil = 0` (보너스 소비), **`defender.stunUntil = 0`** (피격 시 스턴 즉시 해제 — Phase 7) |
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

## 7. WeaponStats 튜닝 노브

D키로 디버그 패널 열어서 실시간 슬라이더 조정 가능. Phase 16에서 timing이 attack kind별로 분리되었고, weapon은 3 프리셋 — 아래 수치는 `BASIC_SWORD`(균형) 기준이고 CHARGE/RAPIER는 한 축씩 트레이드오프.

### 넉백 — slice < counter < thrust 위계 (Phase 16 재튠)

| 노브 | BASIC | CHARGE (counter specialist) | RAPIER (thrust specialist) | 변위 (n/FRICTION 5.0) |
|---|---|---|---|---|
| `sliceKnockback` | 4.0 | 3.0 ↓ | 3.0 ↓ | BASIC 0.8 unit |
| `counterKnockback` | 5.0 | **7.5 ↑↑** (한 방으로 mid-arena → ringout 위협) | 4.0 ↓ | BASIC 1.0 |
| `thrustKnockback` | 6.0 | 5.0 ↓ | **9.0 ↑↑** (slice arc 밖에서 찌르기) | BASIC 1.2 |

- `attackerFollowFraction` (1.0, 모든 프리셋 공통) — push-along 비율. 1.0 = 풀 추격으로 거리 보존 (Phase 7).

> Phase 9.5에서 단일 PLASMA_BLADE의 6.0/7.5/10.5에서 -25% 튠했었는데, Phase 16 다중 프리셋 전환 시 BASIC은 더 약하게(4/5/6) 잡고 특화 프리셋의 한 축을 부각시키는 방식으로 재배분. ARENA_RADIUS 4.0이라 1히트 KO는 RAPIER thrust가 mid-arena에서, CHARGE counter가 마찬가지로 중간거리에서 가능.

### 타이밍 — kind별 분리 (Phase 16, d70f0a9)

이전 단일 `windUpMs`/`thrustChargeMs`/`attackCooldownMs`는 폐기되고 4개 필드로 분리. 모든 프리셋은 4개 필드를 명시적으로 declare(부분 상속 위험 회피).

| 노브 | BASIC | CHARGE | RAPIER | 의미 |
|---|---|---|---|---|
| `sliceImpactMs` | 280 | 320 ↑ (heavier swing) | 300 | input → resolver 발동까지 (텔레그래프) |
| `thrustImpactMs` | 180 ↓ | 240 | **120** ↓↓ (rapier 시그니처) | 동일, thrust 전용 |
| `sliceCooldownMs` | 600 | 600 | 600 | input → 다음 input 락아웃 |
| `thrustCooldownMs` | 400 ↓ | 400 | 400 | 동일, thrust 전용. 707a96c에서 600→400 |

- `swingDurationMs` (120, 모든 프리셋 공통) — impact 후 swing → recovery 시각 시간
- `stunMs` (1500, 모든 프리셋 공통) — **블록 후 한 페이즈의 길이**. (a) 공격자 stun 락아웃, (b) 디펜더 카운터 윈도우, (c) thrust block stun 모두 같은 클럭. 피격 시 즉시 해제. (Phase 7 통합)

### 판정
- `guardAngleTolerance` (45°, 모든 프리셋) — perpendicular 허용폭. Phase 16에서 30°→45°로 완화 (사용자가 가드 성공률 향상 요청)
- `motionImmunityVelocityThreshold` (1.0) — 이상 속도면 양쪽 공격 무효 + `commitPending` 입력 거부 (Phase 7)

### 형상
- `bladeLength` — BASIC/CHARGE 1.2, **RAPIER 1.4** (가드 segment 함께 길어져 수비 보너스)
- `thrustReach` — BASIC/CHARGE 1.4, **RAPIER 1.7** (slice arc 밖 찌르기 가능)
- `minSliceReach` (0.35, 모든 프리셋) — 슬라이스 최소 드래그 거리 (탭 무시)

### 비-WeaponStats 상수
- `FRICTION = 5.0` (`useDuelLoop.ts`) — Phase 7: 2.5 → 5.0. exp 감속 계수, 반감기 138ms.
- `ARENA_RADIUS = 4.0` (`shared/src/combat/arena.ts`) — Phase 16. 클라 시각/솔로/서버 ringout이 동일 상수 공유.
- `INITIAL_PLAYER_POS = -1.0`, `INITIAL_OPPONENT_POS = +1.0` — 동일 파일.
- `SWORD_FORWARD_OFFSET = 0.35` (`Fighter.tsx`) — xbot/ybot hand bone 기준 blade plane 거리. idle은 IK grip, non-idle은 right-hand bone grip 우선.
- `GUARD_FORWARD_OFFSET = 0.51` (`Fighter.tsx`, Phase 16) — 가드 시 검·손이 chest 앞 이 거리에 자리잡음 (idle Z=0.35보다 더 앞).
- `GUARD_HAND_SIDE_REACH = BODY_HALF_WIDTH * 0.5` (`Fighter.tsx`, Phase 16) — 가드 right hand가 마우스 방향에 따라 chest 좌우로 클램프되는 max X 거리.

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
- [x] **Pit hazard — 가시 함정 (이전 Water shader 대체)** — Phase 8: Water `ShaderMaterial`(3-layer sine + 샤프 스파클). Phase 16+: jbouny/ocean 셰이딩 모델로 재작성(6-octave + fresnel + sun glint). **Phase 16+ 최종**: 사용자 피드백 ("물 색이 회색이고 연산도 무거움 + 위험 시그널이 약함") 반영해 가시 함정으로 대체. `Spikes.tsx`가 결정론 mulberry32(0xCAFEBA) 시드로 annulus 영역에 area-uniform 분포 ~160개 가시 배치. drei `<Instances>` 2개 그룹 — 바디(rusty iron `#332a23`, 0.55 metalness, CylinderGeometry [0.05, 0.16, 0.65]) + 팁(emissive `#ff3a1a` intensity 1.5, ConeGeometry [0.05, 0.30], `toneMapped: false`). 어두운 pit floor ring(`#181210`)로 베이스. `Arena3D`의 outer basin ring도 `#5f5446` → `#241914`로 어둡게 통일. `WATER_LEVEL = -0.32` → `PIT_LEVEL = -0.42`로 리네임 + 0.10 깊게 (가시가 충분히 위로 솟도록). 정적 인스턴스라 셰이더 vertex/fragment 비용 사실상 0 (이전 192×192 wave plane 대비). 위험 시그널은 빨간 emissive 팁이 즉각 전달 (Bloom 0.85 임계 위)

### 게임플레이
- [ ] **AI 시드 RNG** — `Math.random` 대체. 랭크 리플레이/네트코드 결정론 필수
- [ ] **4라운드 서든데스** — 좁은 발판 + 2히트 KO (chambara 원작)
- [ ] **플레이어 이동** — 현재는 넉백으로만 위치 변화. WASD 이동? 아니면 의도적으로 X
- [x] **무기 종류** (Phase 16) — `BASIC_SWORD` / `CHARGE_SWORD` (counter specialist) / `RAPIER` (thrust specialist) 3 프리셋. 잼 후 4번째(쌍검 / Timely Block 등) 후보.
- [ ] **사전-KO 슬로모 활성화** (Phase 16에서 인프라 구축, 발화 비활성) — `predictKoPotential` 휴리스틱이 false positive를 너무 많이 잡아 모든 swing이 슬로모 → 게임 페이스 깨짐. 더 보수적 predicate(예: 이미 ringout 거리만큼 push 가능 + counter window 활성) 정의 후 활성화.

### 멀티플레이 / 랭크 (Day 2)
- [x] **Cloudflare RankedQueue Durable Object** (Phase 11a + **11.6**) — `playerId`/rating/name을 받아 ±200 범위 매칭, 매치 성사 시 `ranked-{a}-{b}-{base36(Date.now())}-{uuid}` roomId 발급. **Phase 11.6**: `state.storage` 영속화 (key `"waiting"`) — DO eviction/Worker 재시작 후에도 큐 보존. 같은 playerId 재폴링 시 기존 위치를 유지한 채 entry 갱신해서 자기 자신 매칭과 queue-order 밀림을 방지. **잔여**: 30s 대기 시 범위 확장 (P2).
- [x] **Cloudflare DuelRoom Durable Object** (Phase 11a + **11.6**) — WS upgrade, alarm 기반 30Hz tick. `DuelRoomSession`이 hello/ready/guard/attack 처리 + countdown→fighting→roundOver→matchOver 상태머신 + 서버 권위 `resolveAttack`/`applyOutcome` 호출. **Phase 11.6**: roomId UUID 접미사로 같은 두 플레이어가 같은 millisecond에 재매칭돼도 별도 DO 인스턴스 보장 (이전 매치 state 잔존 방지). **잔여**: Hibernation API (P2).
- [x] **권위 서버 모델** (Phase 11a) — 클라는 가드 스냅샷 + 공격 이벤트만 송신. 이동은 outcome-driven (`applyOutcome` velX → `tickFighter` 적분 → ringout). 클라 입력 메시지에 walk/move 없음.
- [x] **`state` 30Hz broadcast** (Phase 11a) — fighting tick마다 `{ t: "state", serverNow, player, opponent }` 송신. 페이로드는 `{ posX, velX, guard, stunUntil, attackCooldownUntil, counterUntil }`. 클라가 상대 위치를 알 유일한 경로.
- [x] **ELO matchOver payload + rating 영속화** (Phase 11a/11c) — K=32, matchOver 메시지에 `ratings: { player: { before, after, delta }, opponent: {...} }` 포함. `DuelRoom`이 matchOver 후 `Leaderboard` DO에 W/L/D + rating을 fire-and-forget 저장. `/leaderboard` Top 20, `/me` 조회 지원.
- [x] **CORS** (Phase 11a) — `json()` 모든 응답에 `*` allow-origin + methods/headers, `OPTIONS` 프리플라이트 204.
- [x] **클라 네트워크 어댑터** — `useRankedMatch` 훅, `/matchmake` polling, WS 연결, `state` interpolation, `impact` → `dispatchImpactFx`, TitleScreen Solo/Ranked 토글.
- [ ] **`wrangler deploy` + 클라 env 분기** — Worker URL을 클라가 어떻게 받을지 (build-time env vs runtime config).
- [ ] **인증 / playerId** — 잼 범위에선 `localStorage["chambara.playerId"]` UUID + `["chambara.name"]` 기반. 영속화는 DO SQLite.
- [ ] **임팩트 시점 동기화** — 현재는 클라가 보낸 attack의 latest guard 판정. 여유 시 최근 200-300ms state history로 rollback 보정.
- [x] **옵저버 측 검 끝 보간** (Phase 16, 9701b44) — `blade-tip-predictor`가 30Hz 스냅샷 사이 lead/catch-up. snapshotCorrection 0.85, maxLead 0.08s/0.42unit, exponential catch-up rate 26.
- [x] **상대 abandonment 처리** (Phase 16, 330a760) — 매치 중 상대 WS detach 시 서버가 즉시 forfeit matchOver broadcast + leaderboard 반영. worker test로 회귀 가드.
- [x] **사설방** — TitleScreen에서 Private Room code를 열면 `/rooms/private-*`에 직접 WS 연결. `record=0`으로 랭크 리더보드/로컬 rating에는 반영하지 않음.
- [ ] **토너먼트 자동 브래킷** — 현재 UI에서 비활성화. 승자 집계/브래킷 진행 Durable Object까지 구현한 뒤 활성화.
- [x] **클라 옵티미스틱 desync 보정** (Phase 11.6) — `useRankedMatch.localPlayerAttackConfirmed` ref. 서버는 모든 outcome(rejected/miss 포함)에 대해 `impact` 메시지 broadcast하므로, `attackerSide === ourSide` 인 impact가 `impactAt + 220ms` 안에 도착하지 않으면 server reject로 간주 → visual 조기 클리어.
- [x] **server-clock fallback 클램프** (Phase 11.6) — 첫 `state` 메시지 전 `lastServerNow === 0` 케이스에서 stun/cooldown UI를 0으로 클램프. 이전엔 `Date.now()` fallback이 절대 server timestamp와 비교돼 spurious 큰 값 생성.
- [x] **matchmake retry/backoff** (Phase 11.6) — `pollUntilMatched`에서 fetch 실패 시 exponential backoff (500ms → 8s cap, 2^n). 4xx/abort는 즉시 throw. 네트워크 글리치 시 큐 폴링이 hard-fail 안 함.

### 배포 / 컴플라이언스
- [x] **무료 배포** (Phase 13, 2026-04-29) — Worker `https://chambara-ranked-worker.200tiger1.workers.dev` + Client (Cloudflare Pages) `https://chambara-duel.pages.dev`. DO bindings (RANKED_QUEUE/DUEL_ROOM/LEADERBOARD) v1+v2 마이그레이션 라이브. `/healthz`, `/leaderboard`, `/matchmake` (queue→match transition) 모두 200 검증.
- [x] **GitHub Actions CI/CD** (2026-04-29) — `.github/workflows/deploy.yml`, main push → verify(test+typecheck) → 병렬 deploy-worker + deploy-pages (`cloudflare/wrangler-action@v3`). secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. 첫 라이브 검증 run #25107786727 green (worker 42s + pages 45s).
- [x] **AI 코드 비율 ≥ 90%** — Phase 1~13 22 commits 전체 Claude Code(Opus) 주도 작성, 사용자는 잼 컨셉/피드백/IP 결정만 가이드. `docs/vibe-jam.md` §8 + `docs/duel-implementation.md` §9 phase history가 근거.
- [x] **즉시 로딩** — Pages TTFB 71ms / Total 81ms (라이브 측정, 2026-04-29), JS 번들 gzip 388KB. `soldier.glb` 2.1MB는 `?demo=character` 한정 — 메인 critical path 밖.
- [ ] **모바일 동작 검증** (iOS Safari 자이로/터치) — P2, 30초 reject 회피
- [ ] **두 창 라이브 매칭 smoke test** — Solo/Ranked 토글 → queue → match → state broadcast → impact → matchOver → leaderboard 갱신 흐름 (브라우저 직접)

### 컨텐츠 (P2 폴리시)
- [ ] **캐릭터 메시** — 현재 box+sphere placeholder. Quaternius 로우폴리 / Tripo3D 사전 풀
- [ ] **다리 메시 + walk 애니메이션** — knockback 시 자연스러운 이동 표현
- [ ] **사운드** — 충돌/스윙/넉백 SFX 0
- [ ] **MeshToonMaterial** — 카툰 톤 통일 (Phase 7 후 도입 권장)

### 코드 품질
- [ ] **테스트** — shared/combat에 vitest 단위 테스트 (resolver 룰 회귀 방지). worker는 45 tests로 외곽 보호.
- [ ] **번들 크기** — 현재 1.25MB / gzip 353KB. dynamic import로 데모 라우트 분리
- [ ] **AI 설계 문서화** — 현재 ai.ts 내부 주석에만 존재
- [x] **GPU 리소스 dispose** (Phase 11.6) — `SparkParticles` 풀 + `DuelDebug.HitboxWire`가 `useEffect` cleanup으로 geometry/material `dispose()`. R3F는 JSX 자식만 자동 dispose하므로 imperative `useMemo` 풀은 명시 정리 필요.
- [x] **HUD 접근성** (Phase 11.6) — `DuelHud`에 sr-only `<div role="status" aria-live="polite">` 추가. countdown/round-over/match-over 상태 변화에만 자연어 송출 (frame 필드는 deps 제외 → fight 도중 spam 방지).
- [x] **useFlash brightness jump 제거** (Phase 11.6) — 이전엔 `pulse()`가 `amount: newPeak`로 매번 리셋해서 진행 중 envelope 위에 약한 pulse가 와도 화면 밝기가 peak로 점프. `Math.max(cur.amount, intensity)`로 변경 — 약한 pulse가 dim도 안 되고 jump도 안 됨.

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
| **7** | **Jam-prep balance + camera/visual sync**: (a) 카메라 정중앙 뒤+살짝 위, useFrame Z lerp 추격 (b) 검·가드 fighter group worldZ에 lock, raycast plane도 player Z로 이동 (c) `attackerFollowFraction` 1.0 + `FRICTION` 5.0 → 거리 보존 + 빠른 가감속 (d) `commitPending` motion gate — 이동 중 입력 거부 (e) 넉백 위계 재설정 (slice 8 / counter 10 / thrust 14) — slice<counter<thrust (f) thrust block에도 stun 적용 (g) `stunMs` 1500 + 피격 시 즉시 해제 (h) `counterWindowMs` / `thrustBlockStunMs` → `stunMs` 단일 변수로 통합 (i) 스턴 시 머리 위 노란 별 2개 시각 인디케이터. 이후 post-hit `tradeImmune`는 cooldown/pending gate와 중복되어 제거됨. |
| **8** | **Day 1 시각 P0 완료**: (a) `@react-three/postprocessing` 도입, Canvas에 `<EffectComposer><Bloom>` + ACESFilmic 톤매핑 (b) 검 emissive를 황색→시안(`#38bdf8`) 라이트세이버 톤으로 통일, intensity를 Bloom threshold 위로 상향(swing 3.4 피크) (c) drei `<Trail>` 검 끝 부착 — 0.22 width, 1.6s 길이, decay 3 (d) `ImpactEvent` 타입 + `impactEvents` ref를 `useDuelLoop`에 추가 (resolver outcome 발화시 push, miss/rejected 제외, 800ms prune), `ImpactRings` 컴포넌트가 outcome별 ring 렌더 (hit 노란빛 / pierce 핑크 / block 시안) + 카메라 셰이크 X·Y 오프셋 (e) `MatchState.lastRoundReason` 추가 — "ringout"일 때 `KoSplash` 132px headline + pop-in/settle/fade 애니메이션 (f) `Arena3D` 4-tier로 분리: 페데스탈 cylinder(`#8c7558`) → 내부 디스크(`#b59872`) → 외곽 림(`#4a3d2c`, RIM_LIFT=0.06) → 발광 페리미터 ring(`emissive #38bdf8`, `toneMapped: false`) (g) `Water.tsx` 신규 ShaderMaterial — 3-layer 변위(amp 0.06m) + 깊이 그라디언트 + 샤프 스파클(`pow(sp, 14)`) + 0.32m 쇼어라인 폼. 1차 시안에서 스파클 주파수 4.2(블롭)/쇼어 1.15m(과도) → 9.0/0.32m로 튜닝 |
| **11a** | **Cloudflare 랭크 백엔드 — 권위 룸 + state broadcast + CORS** (`worker/`, 최초 30 tests passing): (a) `worker/` 워크스페이스 신설 (`@vibejam/worker`, dependsOn `@vibejam/shared`). `wrangler.toml`에 `RANKED_QUEUE`/`DUEL_ROOM` DO 바인딩 + `new_sqlite_classes` 마이그레이션 선언 (b) `index.ts` 라우터 — `/healthz`, `/matchmake` (RankedQueue DO로 forward), `/rooms/:id` (DuelRoom DO로 forward), `OPTIONS` (corsPreflight) (c) `RankedQueue` DO — `parseMatchmakePlayer`로 hello payload 검증, `Math.abs(rating - waiting.rating) <= 200`인 첫 후보와 매치, 없으면 큐에 enqueue + `{status: "queued", queueSize}` 응답. 11.6에서 최종 roomId는 `ranked-{a}-{b}-{base36(Date.now())}-{uuid}` (d) `DuelRoom` DO — WebSocketPair upgrade, `state.storage.setAlarm(now + 33ms)`로 30Hz tick 스케줄. 메시지 string만 허용, close/error 시 detach (e) `DuelRoomSession` — fighters 양쪽 메모리 보유, hello로 사이드 자동 할당(player→opponent→room_full), ready 둘 다면 countdown 진입, attack 수신 시 `resolveAttack`/`applyOutcome` 호출 후 `impact` broadcast, fighting tick에서 `tickFighter`로 velX 적분 + ringout/timeout 체크. 매치 종료 시 `applyEloResult` (K=32)로 ratings 계산해서 matchOver payload에 포함 (f) **`state` 30Hz broadcast 추가** — `tick()` fighting 분기에서 `tickFighter` 후 `broadcastState(now)` → `{ t: "state", serverNow, player: {posX, velX, guard, stunUntil, attackCooldownUntil, counterUntil}, opponent: {...} }`. 클라가 상대 위치를 알 유일한 경로 (이동 입력 채널 없음 — outcome-driven movement 모델) (g) **CORS** — `http.ts`의 `json()`이 모든 응답에 `Access-Control-Allow-Origin: *` + methods/headers 부착, `corsPreflight()` 헬퍼로 OPTIONS 204 응답 |
| **11.5** | **Sparks 파티클** (`docs/jam-polish-plan.md` §11.5, `claudedocs/research_impact_feedback_20260429.md` §3.1.6): (a) `client/src/duel/SparkParticles.tsx` 신설 — `THREE.Points` + 커스텀 `ShaderMaterial`. POOL_SIZE 256개 슬롯 ring-buffer, 각 슬롯 attribute = `position`(origin) + `aVelocity` + `aStartTime` + `aLifetime` + `aColor` + `aSize` (b) 버텍스 셰이더 GPU 적분: `pos = position + aVelocity * t + 0.5 * uGravity * t²`, `t = uTime - aStartTime`. CPU는 emit 시점에 1회만 attribute write, 이후 재생은 GPU 전용. `gl_PointSize = aSize * (1 - vAge) * (300/-z)`로 거리 보정 + 페이드 (c) 프래그먼트: 부드러운 디스크 (`smoothstep(0.42, 0.5, r)`) + 핫 코어 글로우 (중심 +0.5×). `AdditiveBlending` + `depthWrite: false` (d) **Kind별 burst** (`CONFIGS`): BLOCK 시안 10발 (speed 2.0–3.6, gravity 0.8, lifetime 0.55s, upBias 0.4) / HIT 마젠타 9발 (2.6–4.2, 1.4, 0.7s, 0.55) / PIERCE 오렌지(60%)+그레이 cloth(40%) 15발 (2.4–5.0, 1.1, 0.85s, 0.45) / KO 흰(50%)+마젠타(50%) 30발 (3.5–7.0, 0.5, 1.1s, 0.25 — 폭발에 가까운 풀-구) (e) Bloom 통과: 컬러를 `boost` 배수(1.1–2.4)로 곱해 luminance 0.85 임계 위로 끌어올려 검 emissive와 같은 글로우 파이프라인 사용 (f) `useImpacts.events` 구독 — `id` monotonically increasing이라 `lastEmittedId.current` 비교만으로 새 이벤트 검출 (zustand prune 시에도 false positive 없음) (g) `frustumCulled={false}` + 큰 boundingSphere — 카메라 앵글이 좁아도 슬롯 culling으로 사라지지 않음 |
| **11.6** | **Audit pass + 신뢰성 패치** (Phase 11c 직후, Phase 13 배포 전 안정화): 6개 도메인 병렬 sub-agent 코드 리뷰 + raw code 직접 검증. **12개 패치 적용**: (a) `useFlash.ts:49` brightness jump — `amount: newPeak` → `Math.max(cur.amount, intensity)` (b) `useRankedMatch` server-clock fallback — 첫 state 도착 전 stun/cooldown UI를 0으로 클램프 (c) `useRankedMatch` countdown remaining fallback — server clock 보정 전에는 `phaseEndsAtServer - 0`을 쓰지 않고 local phase deadline 사용 (d) `useRankedMatch` 옵티미스틱 desync — `localPlayerAttackConfirmed` ref로 unacked visual 조기 클리어 (e) `RankedQueue` roomId — `ranked-{a}-{b}-{base36(Date.now())}-{uuid}`로 같은 millisecond 재매칭도 별도 DO 보장 (f) `RankedQueue` 영속화 — `state.storage` lazy load + `put(WAITING_KEY, waiting)` (g) `RankedQueue` polling dedupe — 같은 playerId 재폴링 시 기존 위치 유지 갱신으로 자기 매칭과 queue-order 밀림 방지 (h) `pollUntilMatched` exponential backoff — 500ms → 8s cap (i) `SparkParticles` GPU dispose (j) `DuelDebug.HitboxWire` GPU dispose (k) `DuelHud` sr-only `aria-live="polite"` announcement region (l) ranked queue position 회귀 테스트 추가. **3개 false-positive 검증으로 패치 보류**: `/result` 인증 — `worker/src/index.ts`에 `/result` 라우트 미노출; room_full 정리 — `socket.close` → `close` listener → `detach` 정상 작동; TitleScreen focus trap — 풀화면에 모달 패턴 부적절. 누적: 42 → **46 worker tests**, client typecheck 통과 |
| **11c** | **퍼시스턴스 + 리더보드 DO** (`docs/jam-polish-plan.md` §11c, `docs/ranked-multiplayer-cloudflare.md` §"저장소 선택"): (a) `worker/src/leaderboard.ts` 신설 — `Leaderboard` Durable Object. `state.storage.put/get/list` (KV 인터페이스, `new_sqlite_classes = ["Leaderboard"]` 마이그레이션 v2 선언으로 SQLite-backed). 키 = `p:{playerId}`, 값 = `{playerId, name, rating, wins, losses, draws, updatedAt}` (b) 라우트: `GET /leaderboard` → Top 20 (rating desc, tiebreak updatedAt desc → playerId asc), `GET /me?playerId=X` → 단일 행 또는 null, `POST /result` (internal) → 양쪽 upsert + W/L/D 누산. playerId ≤64자 / name ≤24자 sanitise (c) `wrangler.toml`에 `LEADERBOARD` 바인딩 + `[[migrations]] tag = "v2"` 추가. `bindings.ts`에 `LEADERBOARD?: DurableObjectNamespace` (optional — 미바인딩 시 `/leaderboard` 500) (d) `worker/src/duel-session.ts`에 `MatchOverEvent` 인터페이스 + `DuelRoomSessionOptions.onMatchOver` 콜백. `endMatch`가 `applyEloResult` 결과 + 양쪽 outcome("win"/"loss")로 콜백 발화 (양쪽 hello 완료 시에만 — ratings != null 가드) (e) `worker/src/duel-room.ts`에 `LeaderboardEnv` 타입, DuelRoom DO가 env retain하고 session 생성 시 `onMatchOver` 와이어. 콜백은 fire-and-forget으로 LEADERBOARD DO에 internal `POST /result` 송신 (실패해도 매치 종료 broadcast가 막히면 안 됨 → try/catch 무음 처리) (f) `worker/src/index.ts`에 `/leaderboard`, `/me` 라우트 추가 — 둘 다 `GLOBAL_LEADERBOARD_NAME = "global"`로 forward (g) **클라**: `client/src/duel/network/leaderboard.ts` (`fetchLeaderboard` / `fetchMe`), `client/src/duel/LeaderboardView.tsx` (Top 20 테이블 + 내 기록 row + 에러/빈 상태). `TitleScreen`에 옵셔널 `onShowLeaderboard` prop + "View Leaderboard" 버튼. `Duel` 루트에 `showLeaderboard` 상태 추가 (h) **테스트**: `worker/test/leaderboard.test.js` 신설 (in-memory storage mock — Map 백, `get/put/list` 구현), upsert / W/L/D 누산 / 드로우 / Top 20 정렬 / sanitise / 404+400 검증. `duel-session.test.js`에 `onMatchOver` 콜백 페이로드 검증 추가. `http.test.js`에 LEADERBOARD stub 추가 + `/leaderboard`, `/me` 라우팅 검증 + 미바인딩 500 검증. **30 → 42 tests** |
| **11b** | **클라 네트워크 어댑터** (`docs/jam-polish-plan.md` §11b, `docs/ranked-multiplayer-cloudflare.md`): (a) `client/src/duel/network/` 신설 — `types.ts` (`ServerMessage`/`ClientMessage` 와이어 프로토콜, worker `duel-session.ts`와 1:1 매칭), `matchmake.ts` (`postMatchmake` + `pollUntilMatched` 2초 간격 큐 폴링, `getOrCreatePlayerId`로 `localStorage["chambara.playerId"]` 16바이트 hex 발급, `readStoredRating`/`writeStoredRating`으로 `localStorage["chambara.rating"]` 영속화, default 1000), `RankedClient.ts` (브라우저 WebSocket 래퍼 — open 전 outbox 버퍼링, JSON parse, 자동 재접속 X) (b) `useRankedMatch` 훅 신설 — `UseDuelLoop`과 같은 shape 반환해서 `Duel.tsx`의 GameStage가 솔로/랭크 동일 코드로 렌더 가능. server `state` 메시지의 `player`/`opponent` 라벨이 우리 `ourSide` (서버 할당)에 따라 좌우 반전될 수 있어 mirror 처리해서 `playerVisual`이 항상 *우리* 파이터를 가리킴 (c) `state` 메시지 30Hz → posX/velX/guard/stunUntil/attackCooldownUntil 받아 `playerVisual.worldZ`를 lerp(target, 0.32)로 보간 (raw teleport 방지). 서버 클럭 추적 (`lastServerNow + (now - lastServerNowAt)`)으로 stun/cooldown remainingMs 산출 (d) `impact` 메시지 → `dispatchImpactFx(kind, ctx)` 직결 (Phase 10a 통합 포인트). attackerSide → `attackerIsPlayer` 변환, defender 위치는 최신 state 스냅샷에서 읽음 (e) 입력 송신: `setPlayerGuard`는 ~30Hz 스로틀(`GUARD_SEND_INTERVAL_MS=33`)로 `{ t: "guard", guard }` 송신 + 로컬 visual은 즉시 반영. `handlePlayerAttack`은 `mouseToAttackEvent` 빌드 후 `{ t: "attack", event, now }` 송신 + **로컬 옵티미스틱 `AttackVisualState`** 셋팅 (검 휘두르는 모션이 서버 라운드트립 없이 즉시 보임). 상대방의 wind-up 애니메이션은 서버 telegraph 메시지 부재로 미구현 (Phase 11.5 후보) (f) 매치 라이프사이클: WS open → `hello` 송신 → 서버 hello 수신 시 `ourSide`/rating 저장 후 `ready` 자동 송신. `match_state`/`round_over`/`match_over` 이벤트로 `MatchState` 미러 갱신 (HUD가 그대로 읽음). `match_over` 시 `ratings.{player,opponent}.after`에서 *우리* rating만 추출해 `writeStoredRating`으로 영속화 (g) `TitleScreen`에 **모드 토글** — 기존 "Start Duel" 단일 버튼을 "Solo (vs AI)" / "Ranked Online" 2개로 분리. `Identity.mode` 필드는 세션마다 새로 선택(persist X). `Duel` 루트 컴포넌트가 `identity.mode === "ranked"` 분기로 `RankedDuelGame` vs `DuelGame` 마운트 (h) `RankedOverlay` 컴포넌트 — `summary.status` 따라 "FINDING DUELIST"/"IN QUEUE"/"MATCH FOUND"/"VICTORY/DEFEAT" 디스플레이 + Cancel 버튼. `in_match` 상태에서만 사라짐. `match_over` 시 rating delta(`+/-N`) 표시. (i) `GameStage`에 `aiEnabled` prop 추가 — 솔로는 true(기존 AI tick 유지), 랭크는 false(서버가 상대 운영). 모든 `setOpponentGuard`/`handleOpponentAttack`은 `useRankedMatch`에서 no-op으로 stub 처리해도 GameStage가 호출 안 함 (j) `VITE_WORKER_URL` 환경변수 추가 (`vite-env.d.ts`) — 미설정 시 `http://localhost:8787` (wrangler dev) 폴백 |
| **10a** | **디스패처 인프라** (`docs/jam-polish-plan.md` §10a, `claudedocs/research_impact_feedback_20260429.md` §1 위계 일관성 원칙): (a) `client/src/duel/stores/` 신설 — `useImpacts`(`ImpactKind = "hit"\|"pierce"\|"block"\|"ko"`, push/prune/clear), `useShake`(Eiserloh 트라우마 모델, `add(t)` 캡 1.0 / `decay(dt)` 1.4/sec linear), `useFlash`(startAt/endAt/peak 추적 envelope, `pulse(durationMs, intensity, now)`로 더 긴 envelope·더 큰 peak는 절대 truncate 하지 않음), `useTimeScale` (Phase 10b 참조) (b) `dispatchImpactFx(kind, ctx)` 단일 진입점 신설 (`client/src/duel/dispatchImpactFx.ts`) — `FX_TABLE`로 outcome별 trauma/hitstopMs/flash/vibrate 정의, ring·shake·time·flash·vibrate 5축을 ±1 프레임 동시 발화. KO는 `slowmoKo()` 분기, 외엔 `hitstop(ms)`. BLOCK flash=null (WCAG 3-flash/sec 회피, research §3.1.5) (c) `useDuelLoop`에서 ref 기반 `impactEvents` 큐 제거 → resolver outcome 발화 시 `dispatchImpactFx(outcome.kind, ctx)` 직접 호출. ringout 감지 시 `dispatchImpactFx("ko", ctx)`로 KO 슬로모 + 강한 셰이크 (d) `ImpactRings`가 props 대신 `useImpacts` 스토어 직접 구독 (e) Phase 11b에서 서버 `impact` 메시지 수신 시 동일 `dispatchImpactFx(kind, ctx)`만 호출하면 클라/서버 outcome이 같은 5축 FX로 통합됨 (네트워크 어댑터 통합 포인트) |
| **10b** | **시간/공간 효과** (`docs/jam-polish-plan.md` §10b, `claudedocs/research_impact_feedback_20260429.md` §3.4·§3.5): (a) `useTimeScale` 스토어 — `hitstop(ms, now)` (envelope 절대 truncate 안 함, FREEZE_SCALE=0.05 = 거의 정지), `slowmoKo(now)` (350ms freeze → 650ms hold @ 0.25× → 200ms cubic ease-out → 1.0×), `tick(now)`로 phase 진행 (b) `useFrame`에서 `tick()` 호출 후 `scale` 읽어 `duel.tick(dt * scale, now)` — 게임 로직만 스케일, VFX(rings/post-FX/flash 디케이)는 raw dt 유지하여 freeze 순간이 시각적으로 드러남 (c) trauma-driven post-FX — 프레임마다 `useShake.decay(dt)` (raw dt, hit-stop에 stuck 안 됨) → `trauma²` 카메라 셰이크(amplitude 0.18). `ChromaticAberration.offset = max(0, trauma - 0.25) * 0.011`로 BLOCK trauma 0.20을 컷오프 아래에 두어 BLOCK CA 펄스 차단 (research §2.1 BLOCK CA = none). `Vignette.darkness = 0.4 + max(0, trauma - 0.7) * 1.3`으로 KO trauma 0.85만 vignette 스파이크 (d) `FullScreenFlash` CSS 오버레이(zIndex 40, mix-blend-mode screen, pointer-events none) — `useFlash.amount` 100Hz 폴링, R3F canvas 위 별도 layer라 추가 render-target 비용 0. HIT 16ms@0.45 / PIERCE 33ms@0.6 / KO 50ms@0.85 (e) `navigator.vibrate` Android 햅틱 — feature-detect, BLOCK [40,30,40] / HIT [80] / PIERCE [20,20,80] / KO [200,100,400]. iOS Safari는 `vibrate` 미구현 → silent no-op (Phase 9 audio sub-bass로 대체 예정, research §3.3.1) (f) Phase 11b 통합 포인트: 서버 `impact` 브로드캐스트만 받으면 본 envelope이 클라이언트별로 자동 작동 — 서버는 outcome kind만 알면 됨 |
| **13** | **무료 라이브 배포 (Cloudflare Workers + Pages)** (2026-04-29): (a) `worker/package.json`에 wrangler 3.114.17 devDep + `dev`/`deploy`/`tail`/`wrangler` 스크립트 추가. (b) `client/.env.example` 갱신 — stale Colyseus `VITE_SERVER_URL` 제거, `VITE_WORKER_URL` placeholder + dev/prod 주석. (c) `client/.env.production` 신설 — `VITE_WORKER_URL=https://chambara-ranked-worker.200tiger1.workers.dev`. Vite는 `vite build` 시 자동 로드해서 정적 번들에 임베드 → 별도 런타임 config 안 필요. (d) `wrangler login` (사용자 OAuth) 후 `yarn workspace @vibejam/worker deploy` → DO 마이그레이션 v1+v2 (RankedQueue/DuelRoom/Leaderboard SQLite 클래스) 라이브, `https://chambara-ranked-worker.200tiger1.workers.dev`. (e) `wrangler pages project create chambara-duel --production-branch=main` → `wrangler pages deploy dist --project-name=chambara-duel --branch=main` → `https://chambara-duel.pages.dev`. (f) **라이브 smoke test 통과**: `/healthz` 200 + `{ok:true}`, `/leaderboard` 200 + `{players:[]}`, `/matchmake` queue→match 트랜지션 (p1 enqueue queueSize=1 → p2 호출 시 status=matched + UUID-suffixed roomId). 두 창 WS 매칭 흐름 (state broadcast / impact / matchOver / leaderboard 갱신)은 사용자 브라우저 검증 잔존. (g) 번들 크기 1.38MB / gzip 388KB — dynamic import 분리는 Phase 14(P2). |
| **9.5** | **Identity & IP polish** (Phase 9.5a~e — `docs/jam-polish-plan.md` §1, `claudedocs/research_character_weapon_customization_20260429.md`): (a) `BASIC_SWORD` → **`PLASMA_BLADE`** 리네임 (Lucasfilm 트레이드마크 회피, 코드 식별자만 — `swordRef`/`SwordPose` 등 내부 식별자 유지). 영향: `weapons.ts`, `useDuelLoop.ts`, `Duel.tsx`, `InputDemo.tsx`, `shared/src/combat/CLAUDE.md` (b) `Fighter`에 **`accentColor` prop** 추가, 단일 hex로부터 HSL slide로 4-stop 팔레트 (core/bright/dim/guard) derive. 모든 sword pose의 emissive를 팔레트 기준으로 분기. drei `<Trail>` color도 사이드별 (c) **Body/Head Fresnel rim 셰이더** — `MeshStandardMaterial.onBeforeCompile`로 outgoingLight에 `pow(1-dot(viewDir, normal), 2.6) * 1.6 * uRimColor` 추가. uniform mutation으로 Phase 9.5d 색 변경 시 셰이더 재컴파일 X (d) **player bodyColor 중립화** — `#3b82f6`/`#ef4444` → `#64748b` 양쪽 동일. 사이드 ID는 블레이드 emissive + rim에만 (research §3.3) (e) **`TitleScreen.tsx`** 신규 — 이름 입력(≤16자) + 5 세이버 색 프리셋(시안/그린/퍼플/마젠타/옐로우, 빨강 제외 IP §7.4) + `localStorage["chambara.name"]`/`["chambara.saber"]` 저장. `readStoredIdentity()` helper로 두 값 모두 있으면 타이틀 스킵, Duel.tsx top-level이 게이트 (f) **`DuelHud` props 확장** — `playerName/Accent`, `opponentName/Accent` 추가. TopBar 좌우 NameTag (`text-shadow: 0 0 8px {accent}`) + FlagDots 색을 사이드 accent 매칭. KoSplash subline `<player> knocked out <opponent>` 형식, accent 색도 사이드별. matchOver 화면에 winnerName 표시. **Opponent는 "AI Bot" 고정** (Phase 11 서버에서 실제 이름 송신 시 교체) (g) **넉백 -25% 튠** (사용자 피드백 "넉백이 너무 큼"): `sliceKnockback` 8.0→6.0, `counterKnockback` 10.0→7.5, `thrustKnockback` 14.0→10.5. 변위 1.6/2.0/2.8 → 1.2/1.5/2.1. thrust 1히트 KO 페이스 → 2-3히트, slice 5히트 → 6-7히트. Switch Sports 원작 페이스에 더 가까움. (h) **Thrust 히트 판정 버그 수정** (사용자 피드백 "thrust가 대부분 miss"): `mouseToAttackEvent`의 thrust event.origin이 마우스 위치 → segment가 body 실루엣 밖에서 시작해 더 멀리 뻗어 거의 항상 MISS였음. `event.origin = (0, SHOULDER_Y)` (chest, body box 내부)로 변경 + len=0 폴백 (forward-up). 비주얼은 이미 chest 기준이라 변경 불필요. AI의 `pickThrust`는 origin을 박스 외부에 두고 박스를 통과하도록 segment 구성하는 패턴이라 영향 없음. `InputDemo`의 동일 패턴도 함께 수정. |
| **12** | **큐트 procedural 캐릭터** (사용자 피드백 "동글동글 귀여운 레퍼런스 스타일" — Switch Sports Mii. `docs/jam-polish-plan.md` §Phase 12 task 33+34 부분 적용): (a) Quaternius/Mixamo 자산은 **잼 본편 미사용** — 사실적 superhero 톤이 Phase 8 저폴리·neon glow 톤과 충돌, Mixamo retarget 디버깅 리스크 높음. 자산은 `client/public/models/`에 보존 (잼 후 폴리시·`?demo=character` 후보) (b) `Fighter.tsx` 박스+sphere → **Mii 풍 프리미티브 합성**: 큰 머리 sphere(r=0.30, y=1.45) + 납작한 머리카락 tuft + 검은 눈 dot 2개 + egg-shape 셔츠 토르소(scale 0.30/0.35/0.24) + 어깨 bump 2개 + 짧은 다리 cylinder 2개 + 납작한 발 sphere 2개 (c) **양손 grip 모션** — `rightArmRef`/`leftArmRef` Group 2개 + `handsRef` Mesh 1개. 매 프레임 `currentSwordPose`의 `fromBladePlane`(검 grip 위치)을 `bladePlaneToLocal`로 로컬 좌표 변환 → 양 어깨(`±SHOULDER_VIS_X=0.24`, `SHOULDER_VIS_Y=1.10`)에서 그 점까지 sword와 동일한 `orientSegment` 헬퍼로 stretch+rotate. 검·가드·어택·옵팩 페이드·스턴별 모두 자동으로 따라옴 (d) **가드 텔(guard tell) — Fresnel rim 폐기 + 전체-블레이드 emissive flash로 전환**. 사용자 피드백 진행: ("외곽선이 가드 시에만 추가됐던 거야") → 5개 body 머티리얼 rim 적용 → ("검이 항상 같은 색이라 rim 차이 없음") → 흰 rim으로 시도 → ("검 색 검정, rim은 accent") → 검정 body + accent rim → ("rim이 특정 각도에서만 보임 — 모든 방향에서 색이 보여야 함"): Fresnel은 view-dependent라 broad-face가 카메라 향할 때 dot≈1 → rim≈0 → 검 body 그대로 검정으로 보임. **`applyFresnelRim` 헬퍼 통째 제거** + `swordRimUniform`/`guardRimColor`/`offRimColor` 제거. 대신 `swordMaterial`을 init 시 `emissive=accentColor`, `emissiveIntensity=0`으로 두고 useFrame에서 `s.guard.active ? 3.0 : 0`로 0.22 lerp = 가드 활성 시 검 표면 전체가 accent로 빛남(view-independent). Bloom 0.85 임계 위로 안정적으로 들어가 모든 각도에서 글로우. body는 `color="#9ca3af"` 중간 회색 (검정이면 어두운 영역에서 잘 안 보이고 흰색이면 밝은 물 반사와 겹침 — 사용자 피드백; 잼 후 sword 재디자인 placeholder), drei `<Trail>` color는 `palette.bright`(accent) 유지 — swing 모션 가독성. **부수 정리**: 셰이더 chunk 리네임 버그(Phase 9.5(c) `output_fragment` → r170 `opaque_fragment`)는 rim 폐기로 해결됨; 5개 body 머티리얼은 처음부터 중립(rim 호출 X), 검은 emissive 기반. 검은 눈은 `MeshBasicMaterial`이라 rim 무관, opacity는 `allBodyMats` 배열에 포함되어 `transparentWhenIdle` 32% 페이드 일관성 유지 (e) **state 색 tint는 셔츠에만** — `s.stunned` → `#facc15` lerp 0.55, `s.cooldown` → `#475569` lerp 0.35. skin/hair/pants/shoe는 중립 유지(피부가 노래지면 어색) (f) **resolver 상수 불변** — `SHOULDER_Y=1.15`, `BODY_HEIGHT=1.7`, `BODY_HALF_WIDTH=0.32`, `BODY_DEPTH=0.42` 그대로 export 유지(Mii 실루엣이 1.7 hitbox 안에 들어감). hitbox AABB·attack origin·sword pivot 모두 그대로라 게임 로직·AI·`shared/combat/` 영향 0 (g) **ringout 낙하 모션 추가** (사용자 피드백 "KO ringout 안 떨어짐, 원래부터 그랬음"): 검출 로직(`useDuelLoop` `Math.abs(posX) > arenaRadius` → phase=roundOver 2200ms)은 정상 작동했으나 시각적 낙하가 부재 — `Fighter.tsx`의 useFrame이 `groupRef.current.position.z`만 갱신하고 y는 0 고정이라 페데스탈 옆 같은 높이에 떠 있었음. `roundOver`에서 velX가 zero로 리셋되므로 Y 낙하를 Fighter.tsx 자체에서 quadratic gravity로 처리(`fallStartRef`로 edge 통과 시점 기록 → `y(t) = -0.5 * 6.0 * t²`, 클램프 -5.0). 1초 안에 물 아래로 잠김. 라운드 리셋 시 `isOutside` false → fallStartRef null → y=0 복귀. (h) **미적용 (Phase 12.x 폴리시)** — task 31(gltf-transform 압축, 자산 안 쓰니 무관), task 32(Blender 멀티 클립 GLB), task 35(Trail을 `mixamorig:RightHand` 부착, 현재 검 끝에 그대로). |
| **14** | **xbot/ybot 임시 캐릭터 + 손-검 소유권 재정의** (사용자 설계 반영): (a) `client/public/models/X Bot.fbx`, `Y Bot.fbx`를 `Fighter`의 모델 prop으로 사용. 모델은 `BODY_HEIGHT`에 맞춰 normalize하고 material clone으로 opacity/tint를 독립 적용. (b) `raw/anim_idle|slash|thrust|block|hit|death.fbx`를 `AnimationMixer`에 연결. 현재는 `slice`/`thrust` 단일 클립이지만 이후 여러 공격 클립이 들어오면 대표 방향 벡터와 입력 방향의 dot product로 가장 가까운 클립을 고른다. (c) idle은 팔 reach와 검 길이의 reach annulus로 grip/tip을 푼다. 검 길이 `1.2`, arm reach `0.46` 기준으로 마우스 거리가 `0.74..1.66`이면 검 끝이 마우스에 정확히 놓이고, 그 밖이면 같은 body→mouse ray 위 가까운 가능한 tip으로 clamp한다. 양손은 같은 점이 아니라 손잡이 위 `0.16` 간격의 두 지점을 잡는다. (d) idle 외 authored animation 중에는 right-hand bone 위치를 sword grip으로 사용한다. 공격/피격/패배 동작에서 검은 손에 들린 상태가 우선이며, 입력 방향은 검 방향/트레일 선택에만 관여한다. (e) 피격과 스턴은 분리 예정: 새 피격 클립이 들어오면 impact reaction과 stun loop/pose를 별도 visual state로 나눈다. (f) post-hit `tradeImmune` 제거 — 연속 공격 방지는 `attackCooldownMs`, pending attack gate, motion gate가 담당한다. |
| **15** | **애니메이션 시스템 확장 — clip timeScale + hit 분리 + 가드 lean** (사용자 피드백 진행: "FBX 클립이 쿨다운보다 김 → 배속 가능?", "hit는 가드 스턴/피격 2개로 분리할 거야", "가드는 별도 클립 없이 idle 변형", "가드가 chest 정중앙 회전이라 부자연스러움 → 방향에 따라 lean"): (a) **timeScale 인프라** — `Fighter.tsx`에 `fitClipToWindow(action, windowMs)` 헬퍼 추가. `action.timeScale = clamp(clipMs / windowMs, 0.25, 4.0)`로 attack 클립을 gameplay 윈도우(`s.attack.cooldownEndAt - inputAt`) 안에 압축. `playFighterAnimation`이 `windowMs` 인자를 받아 액션 시작 시 적용. `animationWindowMs(s, desired)`가 slash/thrust일 때만 윈도우 반환, 그 외엔 native 속도. (b) `completeAttackAnimation`의 hold `until`을 `s.attack.cooldownEndAt`로 변경 — timeScale로 압축된 클립 종료 시점이 attack 라이프사이클 종료와 정확히 일치. (c) **hit 분리** — `FighterAnimationName`에서 `hit` → `hit_guard | hit_taken`. URL은 `HIT_GUARD_ANIM_URL` / `HIT_TAKEN_ANIM_URL` 두 슬롯으로 나뉘었으나 새 클립 도착 전까지 둘 다 `anim_hit.fbx`. `FighterVisualState`에 `stunSource: "guard" | "hit" | null` 추가. resolver는 `attackerStun`만 세팅하고 hit/pierce는 `stunUntil = 0`이라 현재 `stunned == true` ⇒ 무조건 `"guard"` (피격 reaction은 visual-only 윈도우 ref로 추후 추가 예정 — 슬롯과 라우팅은 이미 준비). `useDuelLoop` / `useRankedMatch` 매 tick에 stunSource 갱신. `desiredFighterAnimation`이 `s.stunSource`로 분기. (d) **block 클립 폐기** — `BLOCK_ANIM_URL` / `blockFbx` / `FighterAnimationName.block` / preload 모두 제거. `desiredFighterAnimation`의 guard 분기 삭제 → idle로 폴백. idle 클립이 계속 루프되는 위에 `currentSwordPose`가 가드 perpendicular segment를 반환하고 useFrame의 idle IK가 grip을 따라가서 손이 자동 이동. (e) **가드 segment lean (가변)** — `Fighter.tsx`의 `leanedGuardSegment(guard, pointer)`가 segment 방향(grip→tip)은 보존하고 중심을 chest에서 pointer 방향으로 `min(mouseDist, GUARD_LEAN_MAX_RADIUS=0.5)` 거리만큼 이동. 1차안은 fixed 0.32였는데 사용자 피드백("원 위만 도는 거잖아 — 원 안에서 자유롭게")으로 가변 거리로 전환. pointer = `s.bladeTipBladePlane` (player=mouse, opponent ranked=server-broadcast blade tip, opponent solo=guard.tip fallback → max lean에서 클램프). 마우스가 chest 가까울수록 lean=0(chest 회전), 멀어질수록 max에서 클램프 → segment center가 반경 0~MAX disc 안에서 자유 이동. resolver의 angle-only guard model 덕분에 시각 lean이 perpendicularity 판정에 영향 0%. |
| **16** | **다중 무기·캐릭터 + 룰 정렬 + 옵저버 보간 + abandonment + KO 슬로모 인프라 + 사이파이 아레나 재테마** (2026-04-30, 15+ commits): (a) **per-weapon timing 분리** (d70f0a9) — `WeaponStats`에서 `windUpMs`/`thrustChargeMs`/`attackCooldownMs` 단일 값을 `sliceImpactMs`/`thrustImpactMs`/`sliceCooldownMs`/`thrustCooldownMs` 4개로 분리. 모든 프리셋 명시 declare. `commitPending`은 attack kind에 따라 schedule, `applyOutcome`은 attackKind별 cooldown 적용. (b) **3 sword presets** (55b2613) — `BASIC_SWORD` (균형, 4/5/6 knockback), `CHARGE_SWORD` (counter specialist — sliceK 3.0 / counterK 7.5 / 더 무거운 swing 320·240), `RAPIER` (thrust specialist — sliceK 3.0 / thrustK 9.0 / thrustReach 1.7 / thrustImpactMs 120 / bladeLength 1.4). `WEAPON_PRESETS: Record<WeaponId, WeaponStats>` + `getWeaponPreset(id)` (BASIC fallback). PLASMA_BLADE는 BASIC_SWORD 별칭으로 worker 후방 호환 유지. (c) **캐릭터·무기 픽커 UI** (55b2613) — TitleScreen에 `CharacterId = "alpha" \| "beta"` (Alpha=Y bot 시안, Beta=X bot 마젠타 — saberColor가 character preset에 묶임), `WEAPON_PICKER_OPTIONS` 카드. 5 세이버 색 픽커 폐기. localStorage `chambara.character` / `chambara.weapon` 영속화. `joinOptions: { name, saberColor, weaponId }`로 worker hello에 송신. (d) **arena.ts 신설** (ca027c8) — `ARENA_RADIUS=4.0`, `INITIAL_PLAYER_POS=-1.0`, `INITIAL_OPPONENT_POS=1.0` 단일 진실 소스. 클라 `Arena3D` 시각 림 / 솔로 `useDuelLoop` ringout / 서버 `duel-session` ringout 모두 import. 이전 시각/서버 4.0/4.2 차이 해결. (e) **thrust 윈도우 단축** (707a96c) — BASIC `thrustImpactMs` 280→180, `thrustCooldownMs` 600→400 (Switch Sports 페이스). RAPIER 더 짧게 (120/400). (f) **blade-tip-predictor** (9701b44) — `shared/src/combat/blade-tip-predictor.ts` 신설. snapshot/frame 두 모드. snapshot 도착 시 `snapshotCorrection 0.85`로 lerp + 두 스냅샷 사이 velocity 측정 (`maxSpeed 24` 클램프). frame tick에서 `min(age, maxLeadSeconds=0.08)`만큼 lead, `maxLeadDistance 0.42` 클램프, exponential catch-up rate 26. `useRankedMatch`가 opponent blade tip wire에 적용. shared/test에 51-line 회귀 테스트. (g) **abandonment forfeit** (330a760) — 서버 `duel-session.ts`의 `detach()`가 매치 중일 때 남은 hello'd 사이드를 winner로 즉시 matchOver broadcast + leaderboard 반영. 클라 `useRankedMatch`도 abandonment 메시지 핸들. worker/test/duel-session.test.js +89 lines 회귀 가드. (h) **stun star head bone tracking** (360ad3f) — `Fighter.tsx`가 `mixamorigHead` bone을 매 프레임 추적해 stunGroup 위치를 head bone에 부착 (이전 고정 y=1.85에서 idle nod로 갭 발생). (i) **사전-KO 슬로모 인프라(비활성)** (30a369b) — `predictKoPotential.ts` 신설 (near-edge OR worst-case projection 휴리스틱). `useTimeScale.koBuildup(ms, now)` envelope 구현 (350ms freeze → 650ms hold @ 0.25× → 200ms ease-out). `useDuelLoop`/`useRankedMatch` attack 시점 hook 와이어. **현재 발화는 비활성화** — false positive 너무 많아 페이스 깨짐, 더 보수적 predicate 필요. ranked KO dispatch fix는 별개로 적용 (랭크에서 ringout 시 dispatchImpactFx("ko") 누락 회복). (j) **guard pose visual + direction indicator 개선** (78c34a3) — Phase 15 lean의 시각 마무리 + 가드 방향 인디케이터 추가 (마우스 방향이 어느 각도를 막는지 명시). (k) **CI fix** (64c80af) — Pages deploy에 sanitized commit subject 전달 (특수문자로 wrangler 깨짐 회피). (l) **Water → 가시 함정 교체 + 깊은 pit** — 사용자 피드백 진행: Phase 8의 sine wave water → jbouny/ocean 셰이딩 모델 포팅(6-octave + fresnel + sun glint) → 여전히 회색으로 워시아웃 + 연산 무거움 + 위험 시그널 약함 → **`Water.tsx` 폐기 + `Spikes.tsx` 신설** → ("점프하면 올라올 정도로 얕다") **`PIT_LEVEL` -0.42 → -3.8으로 3.4m 더 깊게**, `ARENA_HEIGHT` 0.4 → 3.8 파생, `WALL_INNER_RADIUS`에 pit liner cylinder 추가. **가시 길이 2배 + 카운트 3배**(160→480, BODY 0.65→1.30 / TIP 0.30→0.60). 결정론 mulberry32(0xCAFEBA) 시드 annulus area-uniform 분포 + drei `<Instances>` 2개 그룹(body cylinder + tip cone, `toneMapped:false`로 Bloom 통과) + 각 가시 height/width/yaw/tilt 변주. 셰이더 vertex/fragment 비용 사실상 0. ringout 시 fighter 낙하 모션은 변경 없음(quadratic gravity 그대로 — 가시 사이로 빠지는 비주얼). (m) **콜로세움 → 사이파이 인더스트리얼 챔버 재테마** (사용자 피드백 "robot 캐릭터+라이트세이버+콜로세움이 톤이 안 맞음 — 캐릭터·무기에 맞게 수정"): Phase 16(l)의 warm-charcoal sandstone 콜로세움 톤을 캐릭터(xbot/ybot Mixamo robot) + 라이트세이버(시안/마젠타 emissive 검) 분위기에 맞게 갈아엎음. (1) **bg `#0a0807` → `#04070c`**(딥 블루-블랙, 쿨톤 시프트), fog 색 매칭, ambient 컬러 `#5a5360` 웜 → `#3e4a5c` 쿨 그레이-블루(intensity 0.62→0.55). (2) **warm fill `#ff8a4a` 0.45 → cool `#5cc7ff` 0.4** (오렌지 횃불 fill을 시안 림 라이트로 교체). pit 중앙 빨간 ember pointLight는 universal danger 시그널이라 그대로 유지. (3) **walls/tiers 사암 톤 → gunmetal/blue-steel 일제 시프트**: pedestal `#5a4632` → `#202530`, inner basin wall `#574330` → `#262d36`, tier1 floor `#624a32` → `#2c323b`, tier2 `#75593a` → `#363d49`, tier3 `#876a47` → `#404857`, outer wall `#5e4530` → `#1c2128`, top rim `#9c7d54` → `#4d5765`, pit liner `#1a120e` → `#0e1218`(metalness 0.5). 모든 머티리얼 metalness 0.4–0.7, roughness 0.4–0.7로 메탈릭 인더스트리얼 룩. inner playable disk `#b89366` 웜 베이지 → `#3a4554` 쿨 스틸, outer rim `#332918` → `#15191f`. (4) **`SpectatorArch` → `NeonPylon` 컴포넌트 교체**: 각 파일런이 gunmetal box `[0.42, 1.7, 0.18]`(`#2c323b`) + 캡 plate `[0.5, 0.08, 0.22]`(`#3a414b`) + **수직 시안 emissive 스트립** `[0.08, 1.42, 0.02]`(`#5ed3e6` emissive intensity 1.1, `toneMapped:false`) + 상단 비콘 sphere(intensity 1.4)로 구성. 18개 파일런이 멀리서 floodlight ring처럼 보임 — 이전 `#ff6024` 횃불 → 시안 floodlight로 톤 통일. (5) **데크 립 시안 emissive 스레드** + **mid-radius 시안 grid ring**(intensity 0.32, ARENA_RADIUS×0.46–0.475) 추가 — 사이파이 "tech grid" 마커. (6) **Spikes 톤 시프트**: rusty iron `#332a23` (metalness 0.55, roughness 0.55) → gunmetal industrial pike `#2a3038`(metalness 0.7, roughness 0.45), pit floor `#181210` → `#0d1118`(metalness 0.4) — 빨간 emissive 팁은 그대로 유지(universal danger 시그널). 결정론 시드/카운트/높이/배치 변화 없음 — 게임 로직·hitbox·ringout 영향 0. (7) 챔바라 시그니처(시안 페리미터 ring intensity 0.55, `toneMapped:false`)는 보존. (8) **장식 레이어 4종 추가** (사용자 피드백 "경기장으로 감싸 놓기만 해서 허전함"): `SentinelSpire` 4기(카디널 각도, 외곽 r=16.4, 베이스+미드+스파이어+상단 비콘 + 측면 안테나 + 수직 스트립 라이트, 비콘이 시안/마젠타 교차로 두 플레이어 accent 모두 스카이라인 등장), `DeckHex` 9개(데크 중앙 반경 ~12.7, 파일러 사이 6각 gunmetal 패널), 외벽 horizontal `torusGeometry` 컨듀잇 ring 2개(y=1.05 굵음 + y=0.55 얇음, 인더스트리얼 plumbing), `FloatingDrone` 6기(외곽 r=17–18.2, y=4–5.6, 바디 + 시안/마젠타 underbead, fog 띠에 spectator 분위기). 모두 플레이 디스크 외부 배치 → 전투 가독성·hitbox 영향 0. (9) **배경 스카이라인 추가** (사용자 피드백 "외벽 위쪽이 빈 검은 하늘이라 허전"): `DistantTower` 28기(결정론 mulberry32(0xfaceb00c) 시드 + 각도 jitter, r=26–44, 높이 6–18, 너비 1.6–4.4, 색 3-tone variant, ~70% 시안/마젠타 수직 emissive 스트립으로 fog 띠 안에서 글로우, ~27% spire cap + ~18% antenna whip+beacon top variant) + `SKY_LIGHTS` 40 픽셀 비콘(결정론 mulberry32(0xb1ada55), r=22–50, y=3–19, 크기 0.08–0.22 sphere, 시안/마젠타 emissive intensity 1.0–1.8). 모든 배경 요소 정적, 외곽 shadow camera 밖. 결과: cool 톤 인더스트리얼 듀얼 챔버가 fog 띠로 페이드되는 거대 사이버펑크 도시 한가운데 띄워져 있는 비주얼 — 빈 검은 하늘이 도시 스카이라인 + 멀리 떠다니는 비콘 클러스터로 채워짐. typecheck pass. |

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
- [`claudedocs/research_character_weapon_customization_20260429.md`](../claudedocs/research_character_weapon_customization_20260429.md) — 캐릭터·무기·커스터마이징 + IP-안전 네이밍 — Phase 9.5/12/16 근거
- [`claudedocs/research_ranked_mmr_1v1_20260430.md`](../claudedocs/research_ranked_mmr_1v1_20260430.md) — 1v1 랭크 점수 / MMR 시스템 (ELO·Glicko-2·트루스킬 비교) — 잼 후 K-factor 동적화 / 매칭 풀 확장 시 참고
- [`docs/jam-polish-plan.md`](./jam-polish-plan.md) — Phase 8 이후 폴리시 작업 큐 + 사용자 에셋 수집 가이드
- `docs/references/chambara-ref-{1,2,3}.{webp,jpg}` — Switch Sports 챔버라 스크린샷 (카메라 앵글, 검 글로우, 스턴 별 인디케이터 레퍼런스)
