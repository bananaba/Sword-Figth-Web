# client/src/duel/ — Main Game Module

> 메인 듀얼 게임 (`/` 라우트). R3F 렌더링 + 마우스 입력 + 매치 진행 + AI.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `Duel.tsx` | 루트 컴포넌트. Canvas + ACES tonemap + `<EffectComposer><Bloom>` + GameStage + HUD + Debug 토글. **카메라 추격(Z lerp) + 셰이크(X·Y 오프셋)** useFrame 로직. |
| `Arena3D.tsx` | 4-tier 발판: 페데스탈 cylinder + 내부 디스크 + 외곽 림 + **발광 페리미터 ring**. `<Water>` 마운트 + 조명/하늘. |
| `Water.tsx` | 스타일라이즈 워터 ShaderMaterial. 3-layer sine 변위 + 깊이 그라디언트 + 샤프 스파클(`pow(sp, 14)`) + 얇은 쇼어라인 폼. |
| `Fighter.tsx` | 캐릭터 + 검 (단일 segment, phase-based 포즈) + drei `<Trail>` + **스턴 별 인디케이터** |
| `ImpactRings.tsx` | `useDuelLoop.impactEvents` ref를 폴링하는 ring 렌더러. outcome별 색상/반경/두께 + 520ms 페이드. `MeshBasicMaterial { toneMapped: false }`로 Bloom 통과. |
| `useDuelLoop.ts` | 매치 상태머신, pendingAttack, 가드 빌더, **physics tick + FRICTION**, **`impactEvents` 큐(800ms 수명) + `RoundReason`** |
| `useMouseInput.ts` | drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드 |
| `ai.ts` | 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice) |
| `DuelHud.tsx` | 라운드 점수/타이머/카운트다운/**`KoSplash`(ringout 시)**/스턴 바 |
| `DuelDebug.tsx` | D키 패널 — 14개 weapon stat 슬라이더 + 히트박스 와이어 |
| `InputDemo.tsx` | 2D SVG로 resolver 검증 (`?demo=duel-input`) |

## 핵심 좌표 변환 (Phase 7 이후)

- **카메라**: `[0, 2.05, playerZ-1.6]` (정중앙 뒤+살짝 위), useFrame에서 player.worldZ 따라 lerp(0.22)
- **검 위치**: fighter group의 worldZ + `SWORD_FORWARD_OFFSET = 1.6` 만큼 앞 (캐릭터 따라 이동)
- **마우스 raycast plane**: world z = `player.worldZ` (정적 z=0 아님 — 카메라/플레이어 따라 이동)

## Fighter 시각 상태 플래그

- `stunned: boolean` — 별 인디케이터 표시 + 옵팩
- `tradeImmune: boolean` — 옵팩
- `transparentWhenIdle: boolean` (player만 true) — idle 시 32% 투명도. **stun OR tradeImmune 시에만 풀림**.

## 변경 시 주의

- **`useDuelLoop`은 타임라인의 단일 진실 소스**. resolver 호출, AI tick, physics integration 모두 한 곳에서. 새 입력 게이트(예: motion, stun)는 `commitPending` 가드에 추가.
- **`Fighter.tsx`는 시각만**. 게임 룰 결정 로직 X. 새 시각 상태(별, 글로우 등)는 `FighterVisualState` 인터페이스 + `useDuelLoop`이 매 tick 갱신.
- **카메라 lerp 속도(0.22)는 `Duel.tsx` GameStage useFrame**. 너무 느리면 추격 지연, 너무 빠르면 멀미.
- **카메라 셰이크는 `impactEvents` 큐를 매 frame 스캔**. X·Y만 흔들고 Z는 lerp 추격 유지 — Z를 흔들면 멀미. 셰이크 강도/수명은 `Duel.tsx` SHAKE_LIFE_MS + outcome별 power 상수.
- **Bloom 임계값 0.85**: emissive intensity가 이 값을 못 넘으면 발광 안 보임. `MeshBasicMaterial`은 emissive 없으니 `toneMapped: false`로 raw 색상 통과시켜 Bloom 캐치 (ImpactRings/페리미터 ring 패턴).
- **`Water` 셰이더 변경 시 4가지 컴포넌트 함께 튜닝**: 깊이 그라디언트(`smoothstep` 거리), 스파클 주파수+`pow` 노출, 쇼어라인 두께(`uArenaRadius`±), 밴드 기여도. 잘못 튜닝하면 큰 블롭처럼 보임 (Phase 8 1차 시안 사례).

## 더 자세한 정보

- 전투 룰 → `shared/src/combat/CLAUDE.md` + `docs/duel-implementation.md`
- 입력 모델 디자인 의도 → `docs/game-design.md` §3
- 잼 시각 작업 순서 → `claudedocs/research_chambara_visuals_20260429.md` §7
