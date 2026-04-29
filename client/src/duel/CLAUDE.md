# client/src/duel/ — Main Game Module

> 메인 듀얼 게임 (`/` 라우트). R3F 렌더링 + 마우스 입력 + 매치 진행 + AI.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `Duel.tsx` | 루트 컴포넌트. Canvas + GameStage + HUD + Debug 토글. **카메라 추격** useFrame 로직. |
| `Arena3D.tsx` | 원형 발판 + 물 plane + 조명/하늘 |
| `Fighter.tsx` | 캐릭터 + 검 (단일 segment, phase-based 포즈) + **스턴 별 인디케이터** |
| `useDuelLoop.ts` | 매치 상태머신, pendingAttack, 가드 빌더, **physics tick + FRICTION** |
| `useMouseInput.ts` | drag-release 슬라이스 / dbl·middle 찌르기 / R-hold 가드 |
| `ai.ts` | 봇 의사결정 (가드 각도, 슬라이스/찌르기, smart-slice) |
| `DuelHud.tsx` | 라운드 점수/타이머/카운트다운 오버레이/스턴 바 |
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

## 더 자세한 정보

- 전투 룰 → `shared/src/combat/CLAUDE.md` + `docs/duel-implementation.md`
- 입력 모델 디자인 의도 → `docs/game-design.md` §3
- 잼 시각 작업 순서 → `claudedocs/research_chambara_visuals_20260429.md` §7
