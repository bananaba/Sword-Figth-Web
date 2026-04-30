# client/src/duel/ — Main Game Module

> 메인 듀얼 게임 (`/` 라우트). R3F 렌더링 + 마우스 입력 + 매치 진행 + AI.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `Duel.tsx` | 루트 컴포넌트. Canvas + ACES tonemap + `<EffectComposer><Bloom>` + GameStage + HUD + Debug 토글. **카메라 추격(Z lerp) + 셰이크(X·Y 오프셋)** useFrame 로직. |
| `Arena3D.tsx` | 4-tier 발판: 페데스탈 cylinder(`PIT_LEVEL = -3.8`까지 내려가는 3.8m 기둥) + 내부 디스크 + 외곽 림 + **발광 페리미터 ring(toneMapped:false, intensity 0.55)**. `WALL_INNER_RADIUS`에 darkstone pit 라이너. `<Spikes>` + 조명/하늘. **분위기**: bg `#0a0807`(near-black warm-charcoal) + fog 16–36 + ambient `#3a3744` 0.36 + key `#dde0e8` 0.55 (cool moonlight) + warm fill `#ff8a4a` 0.36 (orange torch bounce) + **pit 중앙 pointLight `#ff4520` intensity 3.2 distance 14** (가시 emissive ↔ 기둥/내벽 ember 바운스). 콜로세움 sandstone 톤 다 어둡게(`#3a2f24`/`#473826`/`#52402b`/`#2c2218` etc) + 18 아치 창문이 `#ff6024 emissive intensity 1.1`로 멀리서 횃불처럼 깜빡 (Bloom catch). |
| `Spikes.tsx` | 챔바라 가시 함정 — 물 셰이더 폐기 후 대체. 결정론 mulberry32(0xCAFEBA) 시드로 annulus 영역에 area-uniform 분포 480개(밀도 ~1.8 spike/sq unit). drei `<Instances>` 2개 그룹 — 바디(rusty iron `#332a23`, 0.55 metalness, CylinderGeometry [0.05, 0.16, 1.30]) + 팁(emissive `#ff3a1a` intensity 1.5, ConeGeometry [0.05, 0.60], `toneMapped: false`로 Bloom 통과). 각 가시 height/width/yaw/tilt 랜덤 변주. 어두운 pit floor ringGeometry로 베이스 통일. |
| `Fighter.tsx` | xbot/ybot FBX 임시 캐릭터 + Mixamo FBX 애니메이션(`idle/slash/thrust/hit_guard/hit_taken/death` — block 클립 폐기, 가드는 idle 위 오버라이드) + **clip timeScale 압축**(slash/thrust을 `cooldownEndAt - inputAt` 윈도우에 맞춰 `fitClipToWindow`로 0.25~4.0× 클램프 후 자동 배속) + **중간 회색 검 body** `#9ca3af` + drei `<Trail>` + **스턴 별 인디케이터(head bone tracking)** + **가드 텔(검 emissive flash)** + **ringout 낙하 모션**. idle은 마우스가 검 끝점이 아니라 **몸-마우스 연장선 위의 grip/tip pose**를 만들고 팔 IK가 grip을 따라간다. **가드 시에도 idle 클립을 그대로 재생**하면서 `currentSwordPose`가 perpendicular guard segment를 반환하고, **Phase 16(78c34a3)에서 hand-position 방식으로 리팩터** — `guardRightHandLocal(s, facing)`이 `s.bladeTipBladePlane`에서 chest로 향하는 단위 벡터로 right hand의 X(`±GUARD_HAND_SIDE_REACH = BODY_HALF_WIDTH * 0.5`)·Y(`[SHOULDER_Y - 0.26, SHOULDER_Y - 0.03]`)를 클램프, left hand도 chest 양쪽에 클램프, 두 손 사이 검은 Z=`GUARD_FORWARD_OFFSET=0.51`(chest 앞쪽)로 자리잡음. 마우스 방향에 따라 가드 자세가 자연스럽게 lean. resolver는 segment 방향만 사용 → 게임 로직 영향 0. idle 외 공격/피격/패배 애니메이션 중에는 검을 right-hand bone 위치 + 손목 회전(Mixamo local +Y grip axis) 기준으로 렌더해서 손에서 떨어지지 않고 각도도 애니메이션을 따른다. `s.guard.active`일 때 블레이드 emissiveIntensity가 0 → 1.5, 코어(있는 경우) 1.0 → 2.4 lerp = **블레이드가 accent로 빛남** (이전 3.0이 너무 강해 handle/crossguard 까지 bloom halo가 번지는 문제 → Phase 16에서 1.5로 하향, charge sword의 always-on core가 그 위에서 추가 펄스). `s.stunSource`(`useDuelLoop`/`useRankedMatch`가 매 tick 갱신)에 따라 `hit_guard`/`hit_taken`으로 분기 — 현재 resolver 구조상 stun ⇒ 항상 `"guard"`이며 hit_taken은 미래 피격 reaction 윈도우용 슬롯. **스턴 별은 `mixamorigHead` bone을 매 프레임 추적**해서 idle nod와 함께 머리에 붙어 있다 (Phase 16, 360ad3f). `\|worldZ\| > ARENA_RADIUS`일 때 quadratic gravity로 group.position.y 감소 — `useDuelLoop`이 roundOver phase에서 velX를 zero로 만드므로 이 시각 낙하는 Fighter.tsx 내부에서만 처리 |
| `TitleScreen.tsx` | 이름 + **캐릭터 픽커**(`CharacterId = "alpha" \| "beta"` — Alpha=Y bot 시안, Beta=X bot 마젠타, saberColor가 character preset에 묶임) + **무기 픽커**(`WeaponId = "basic" \| "charge" \| "rapier"`, label + blurb 카드) + Solo/Ranked 모드 토글. localStorage `chambara.name` / `chambara.character` / `chambara.weapon` 영속화. 5 세이버 색 픽커는 폐기 (Phase 16, 55b2613). 5 세이버 색은 character preset에 흡수. |
| `predictKoPotential.ts` | "이 일격이 링아웃 가능한가" 휴리스틱 — 디펜더가 `radius - 1.0` 안 OR max(slice/thrust/counter)/FRICTION push로 `\|projected\| > radius`. 시각 슬로모용 prediction 전용 (resolver/서버 outcome에 영향 0). 현재 발화 path는 비활성 — `useTimeScale.koBuildup` envelope과 함께 인프라만 들어가있음 (Phase 16, 30a369b). |
| `ImpactRings.tsx` | `useDuelLoop.impactEvents` ref를 폴링하는 ring 렌더러. outcome별 색상/반경/두께 + 520ms 페이드. `MeshBasicMaterial { toneMapped: false }`로 Bloom 통과. |
| `useDuelLoop.ts` | 매치 상태머신, pendingAttack, 가드 빌더, **physics tick + FRICTION**, **`impactEvents` 큐(800ms 수명) + `RoundReason`**. Phase 16에서 `ARENA_RADIUS`/`INITIAL_*POS`를 `shared/src/combat/arena.ts`에서 import해서 권위 서버와 동일 룰 사용. 사전-KO 슬로모 hook 와이어 (현재 비활성). |
| `useRankedMatch.ts` | 온라인 어댑터 (Ranked/Private). 30Hz `state` 메시지 수신 → opponent posX/velX/guard 보간. **`createBladeTipPredictor`로 30Hz 스냅샷 사이 상대 검 끝 보간 + 짧은 lead 예측** (Phase 16, 9701b44). 상대 abandonment 메시지 수신 시 즉시 matchOver 미러 (Phase 16, 330a760). 사전-KO 슬로모 hook 와이어 (현재 비활성). |
| `useMouseInput.ts` | drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드 |
| `ai.ts` | 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice) |
| `DuelHud.tsx` | 라운드 점수/타이머/카운트다운/**`KoSplash`(ringout 시)**/스턴 바 |
| `DuelDebug.tsx` | D키 패널 — weapon stat 슬라이더 (Phase 16에서 `sliceImpactMs`/`thrustImpactMs`/`sliceCooldownMs`/`thrustCooldownMs` 4개로 분리, 단일 `attackCooldownMs`/`windUpMs` 폐기) + 히트박스 와이어. `tuningFromWeapon`/`tuningToWeaponPatch`가 현재 선택된 프리셋의 stats를 슬라이더 모델에 매핑. |
| `InputDemo.tsx` | 2D SVG로 resolver 검증 (`?demo=duel-input`) |

## 핵심 좌표 변환 (Phase 7 이후)

- **카메라**: `[0, 2.05, playerZ-1.6]` (정중앙 뒤+살짝 위), useFrame에서 player.worldZ 따라 lerp(0.22)
- **검 위치**: fighter group 기준 blade plane에 렌더. idle은 body→mouse 방향선 위에서 팔 길이에 맞춘 pose를 계산하고, 액션 중에는 right-hand bone 위치와 손목 회전이 grip/angle이 된다.
- **마우스 raycast plane**: world z = `player.worldZ` (정적 z=0 아님 — 카메라/플레이어 따라 이동)

## Fighter 시각 상태 플래그

- `stunned: boolean` — 별 인디케이터 표시 + 옵팩
- `transparentWhenIdle: boolean` (player만 true) — 완전 idle 시 32% 투명도. 공격/가드/스턴/이동 중에는 풀림.

## 변경 시 주의

- **`useDuelLoop`은 타임라인의 단일 진실 소스**. resolver 호출, AI tick, physics integration 모두 한 곳에서. 새 입력 게이트(예: motion, stun)는 `commitPending` 가드에 추가.
- **`Fighter.tsx`는 시각만**. 게임 룰 결정 로직 X. 새 시각 상태(별, 글로우 등)는 `FighterVisualState` 인터페이스 + `useDuelLoop`이 매 tick 갱신.
- **`SHOULDER_Y` / `BODY_HEIGHT` / `BODY_HALF_WIDTH` / `BODY_DEPTH`는 resolver 상수**(`useDuelLoop`이 hitbox·attack origin·sword pivot으로 사용). xbot/ybot 모델은 렌더링에서만 `BODY_HEIGHT`에 맞춰 normalize한다 — 외형만 바뀌고 게임 로직은 0 영향.
- **idle 팔은 sword grip을 follow**. `currentSwordPose()`가 body→mouse ray 위에서 팔 reach와 검 길이의 annulus를 푼다. 마우스가 `|blade-arm|..blade+arm` 안이면 검 끝을 마우스에 정확히 두고, 불가능하면 같은 ray 위 가장 가까운 가능한 tip으로 clamp한다. `Fighter.tsx`의 간단한 two-bone IK가 양손을 손잡이 두 지점으로 당긴다.
- **액션 중 검은 손에 붙고 손목 각도를 따른다**. 공격/가드/피격/패배 등 authored animation이 재생될 때는 right-hand bone 위치를 sword grip으로, Mixamo right-hand local +Y를 blade axis로 사용한다. 공격 FBX는 gameplay cooldown보다 길 수 있으므로 `Fighter.tsx`가 `slash`/`thrust` 클립 종료 시점까지 visual animation을 유지한다. 피격/링아웃은 즉시 interrupt 가능하다. 향후 공격 클립이 늘어나면 attack direction과 클립 메타데이터 방향을 비교해 가장 가까운 액션을 선택한다.
- **피격과 스턴은 분리한다**. 현재는 임시로 `hit` 클립을 스턴 시 재생하지만, 새 피격 클립이 들어오면 impact 순간 hit reaction과 지속 stun idle/loop를 별도 상태로 나눈다.
- **카메라 lerp 속도(0.22)는 `Duel.tsx` GameStage useFrame**. 너무 느리면 추격 지연, 너무 빠르면 멀미.
- **카메라 셰이크는 `impactEvents` 큐를 매 frame 스캔**. X·Y만 흔들고 Z는 lerp 추격 유지 — Z를 흔들면 멀미. 셰이크 강도/수명은 `Duel.tsx` SHAKE_LIFE_MS + outcome별 power 상수.
- **Bloom 임계값 0.85**: emissive intensity가 이 값을 못 넘으면 발광 안 보임. `MeshBasicMaterial`은 emissive 없으니 `toneMapped: false`로 raw 색상 통과시켜 Bloom 캐치 (ImpactRings/페리미터 ring 패턴).
- **`Spikes` 시드(`mulberry32(0xCAFEBA)`)는 절대 변경 금지** — 결정론 레이아웃이라 모든 클라이언트에서 같은 분포. 바꾸면 매 매치마다 가시 위치가 다르게 보임. 색/카운트/높이는 자유롭게 튜닝 가능. 팁 emissive는 `toneMapped: false`로 Bloom 통과 보장.

## 더 자세한 정보

- 전투 룰 → `shared/src/combat/CLAUDE.md` + `docs/duel-implementation.md`
- 입력 모델 디자인 의도 → `docs/game-design.md` §3
- 잼 시각 작업 순서 → `claudedocs/research_chambara_visuals_20260429.md` §7
