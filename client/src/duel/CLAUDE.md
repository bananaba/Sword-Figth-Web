# client/src/duel/ — Main Game Module

> 메인 듀얼 게임 (`/` 라우트). R3F 렌더링 + 마우스 입력 + 매치 진행 + AI.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `Duel.tsx` | 루트 컴포넌트. Canvas + ACES tonemap + `<EffectComposer><Bloom>` + GameStage + HUD + Debug 토글. **카메라 추격(Z lerp) + 셰이크(X·Y 오프셋)** useFrame 로직. |
| `Arena3D.tsx` | 4-tier 발판: 페데스탈 cylinder + 내부 디스크 + 외곽 림 + **발광 페리미터 ring**. `<Water>` 마운트 + 조명/하늘. |
| `Water.tsx` | 스타일라이즈 워터 ShaderMaterial. 3-layer sine 변위 + 깊이 그라디언트 + 샤프 스파클(`pow(sp, 14)`) + 얇은 쇼어라인 폼. |
| `Fighter.tsx` | xbot/ybot FBX 임시 캐릭터 + Mixamo FBX 애니메이션(`idle/slash/thrust/block/hit/death`) + **중간 회색 검 body** `#9ca3af` + drei `<Trail>` + **스턴 별 인디케이터** + **가드 텔(검 emissive flash)** + **ringout 낙하 모션**. idle은 마우스가 검 끝점이 아니라 **몸-마우스 연장선 위의 grip/tip pose**를 만들고 팔 IK가 grip을 따라간다. idle 외 공격/피격/패배 애니메이션 중에는 검을 캐릭터 손 bone 기준으로 렌더해서 손에서 떨어지지 않게 한다. `s.guard.active`일 때 검 emissiveIntensity가 0 → 3.0 lerp = **블레이드 표면 전체가 accent로 빛남(모든 각도에서 보임)**. `\|worldZ\| > ARENA_RADIUS`일 때 quadratic gravity로 group.position.y 감소 — `useDuelLoop`이 roundOver phase에서 velX를 zero로 만드므로 이 시각 낙하는 Fighter.tsx 내부에서만 처리 |
| `ImpactRings.tsx` | `useDuelLoop.impactEvents` ref를 폴링하는 ring 렌더러. outcome별 색상/반경/두께 + 520ms 페이드. `MeshBasicMaterial { toneMapped: false }`로 Bloom 통과. |
| `useDuelLoop.ts` | 매치 상태머신, pendingAttack, 가드 빌더, **physics tick + FRICTION**, **`impactEvents` 큐(800ms 수명) + `RoundReason`** |
| `useMouseInput.ts` | drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드 |
| `ai.ts` | 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice) |
| `DuelHud.tsx` | 라운드 점수/타이머/카운트다운/**`KoSplash`(ringout 시)**/스턴 바 |
| `DuelDebug.tsx` | D키 패널 — 14개 weapon stat 슬라이더 + 히트박스 와이어 |
| `InputDemo.tsx` | 2D SVG로 resolver 검증 (`?demo=duel-input`) |

## 핵심 좌표 변환 (Phase 7 이후)

- **카메라**: `[0, 2.05, playerZ-1.6]` (정중앙 뒤+살짝 위), useFrame에서 player.worldZ 따라 lerp(0.22)
- **검 위치**: fighter group 기준 blade plane에 렌더. idle은 body→mouse 방향선 위에서 팔 길이에 맞춘 pose를 계산하고, 액션 중에는 right-hand bone 위치가 grip이 된다.
- **마우스 raycast plane**: world z = `player.worldZ` (정적 z=0 아님 — 카메라/플레이어 따라 이동)

## Fighter 시각 상태 플래그

- `stunned: boolean` — 별 인디케이터 표시 + 옵팩
- `transparentWhenIdle: boolean` (player만 true) — 완전 idle 시 32% 투명도. 공격/가드/스턴/이동 중에는 풀림.

## 변경 시 주의

- **`useDuelLoop`은 타임라인의 단일 진실 소스**. resolver 호출, AI tick, physics integration 모두 한 곳에서. 새 입력 게이트(예: motion, stun)는 `commitPending` 가드에 추가.
- **`Fighter.tsx`는 시각만**. 게임 룰 결정 로직 X. 새 시각 상태(별, 글로우 등)는 `FighterVisualState` 인터페이스 + `useDuelLoop`이 매 tick 갱신.
- **`SHOULDER_Y` / `BODY_HEIGHT` / `BODY_HALF_WIDTH` / `BODY_DEPTH`는 resolver 상수**(`useDuelLoop`이 hitbox·attack origin·sword pivot으로 사용). xbot/ybot 모델은 렌더링에서만 `BODY_HEIGHT`에 맞춰 normalize한다 — 외형만 바뀌고 게임 로직은 0 영향.
- **idle 팔은 sword grip을 follow**. `currentSwordPose()`가 body→mouse ray 위에서 팔 reach와 검 길이의 annulus를 푼다. 마우스가 `|blade-arm|..blade+arm` 안이면 검 끝을 마우스에 정확히 두고, 불가능하면 같은 ray 위 가장 가까운 가능한 tip으로 clamp한다. `Fighter.tsx`의 간단한 two-bone IK가 양손을 손잡이 두 지점으로 당긴다.
- **액션 중 검은 손에 붙는다**. 공격/피격/패배 등 authored animation이 재생될 때는 right-hand bone 위치를 sword grip으로 사용한다. 향후 공격 클립이 늘어나면 attack direction과 클립 메타데이터 방향을 비교해 가장 가까운 액션을 선택한다.
- **피격과 스턴은 분리한다**. 현재는 임시로 `hit` 클립을 스턴 시 재생하지만, 새 피격 클립이 들어오면 impact 순간 hit reaction과 지속 stun idle/loop를 별도 상태로 나눈다.
- **카메라 lerp 속도(0.22)는 `Duel.tsx` GameStage useFrame**. 너무 느리면 추격 지연, 너무 빠르면 멀미.
- **카메라 셰이크는 `impactEvents` 큐를 매 frame 스캔**. X·Y만 흔들고 Z는 lerp 추격 유지 — Z를 흔들면 멀미. 셰이크 강도/수명은 `Duel.tsx` SHAKE_LIFE_MS + outcome별 power 상수.
- **Bloom 임계값 0.85**: emissive intensity가 이 값을 못 넘으면 발광 안 보임. `MeshBasicMaterial`은 emissive 없으니 `toneMapped: false`로 raw 색상 통과시켜 Bloom 캐치 (ImpactRings/페리미터 ring 패턴).
- **`Water` 셰이더 변경 시 4가지 컴포넌트 함께 튜닝**: 깊이 그라디언트(`smoothstep` 거리), 스파클 주파수+`pow` 노출, 쇼어라인 두께(`uArenaRadius`±), 밴드 기여도. 잘못 튜닝하면 큰 블롭처럼 보임 (Phase 8 1차 시안 사례).

## 더 자세한 정보

- 전투 룰 → `shared/src/combat/CLAUDE.md` + `docs/duel-implementation.md`
- 입력 모델 디자인 의도 → `docs/game-design.md` §3
- 잼 시각 작업 순서 → `claudedocs/research_chambara_visuals_20260429.md` §7
