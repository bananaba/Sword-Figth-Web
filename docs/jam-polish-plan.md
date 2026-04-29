# Chambara Duel — 잼 출시 폴리시 계획

> **작성**: 2026-04-29 (Phase 8 = Day 1 시각 P0 완료 직후)
> **잼 마감**: 2026-05-01 13:37 UTC (~48h 잔여)
> **위치**: Day 1 P0 → 본 문서(Phase 9.5/10) → Day 2 랭크 서버(Phase 11) → 배포(Phase 13)
> **선행 리서치**:
> - `claudedocs/research_impact_feedback_20260429.md` — 시각·청각·햅틱·시간·공간 5축
> - `claudedocs/research_character_weapon_customization_20260429.md` — 캐릭터·무기·커스터마이징
> - `claudedocs/research_chambara_visuals_20260429.md` — Bloom·트레일·물 (Phase 8에서 적용 완료)
>
> **현 빌드 상태**: `docs/duel-implementation.md` §8 (Phase 8까지 반영)

---

## 0. 결정 사항 (2026-04-29 사용자 결정)

| 항목 | 결정 | 근거 |
|---|---|---|
| 캐릭터 스코프 | **(C) 풀 후드 몽크** — Quaternius 베이스 + Mixamo 검술 6 anim | 시간 여유 충분 판단 |
| 상대 검 색 | **마젠타** `#e879f9` (플레이어 시안 `#38bdf8` 유지) | 빨강 = Sith-coded IP 위험 회피, 시안 보색 hue contrast |
| IP 네이밍 | `BASIC_SWORD` → `PLASMA_BLADE`, "lightsaber" → "plasma blade" | Lucasfilm 트레이드마크(글자 + snap-hiss SFX) 회피 |
| 작업 분할 | 사용자 = 에셋 수집 (SFX + 캐릭터 GLB), AI = 코드 단독 진행 항목 우선 | 병렬 진행으로 폴리시 시간 최대화 |

---

## 1. AI 단독 작업 큐

각 Phase 끝마다 `yarn workspace @vibejam/shared build && yarn workspace @vibejam/client typecheck` 통과 후 다음으로 진행. 브라우저 시각 검증은 사용자가 `yarn dev:client`로 직접.

### Phase 9.5 — Identity & IP polish (~2.5h, 에셋 0 의존)

| # | 작업 | 영향 파일 |
|---|---|---|
| 1 | `BASIC_SWORD` → `PLASMA_BLADE` 코드 리네임 + UI 카피 치환 | `shared/src/combat/weapons.ts`, `useDuelLoop.ts`, `Duel.tsx`, `InputDemo.tsx`, `DuelDebug.tsx`, `shared/src/combat/CLAUDE.md` |
| 2 | `Fighter.tsx`에 `side: 'player' \| 'opponent'` prop, emissive 색 분기 (시안 / 마젠타) | `Fighter.tsx`, `Duel.tsx` |
| 3 | placeholder body에 Fresnel rim 셰이더 (5라인 vertex/fragment, 사이드 컬러 매칭) | `Fighter.tsx` (또는 `RimShader.ts` 분리) |
| 4 | Title screen 이름 입력 + 5 세이버 색 프리셋 row + `localStorage["chambara.name"]` / `["chambara.saber"]` | `Duel.tsx` (또는 `TitleScreen.tsx` 신규) |
| 5 | KO splash / HUD에 이름 렌더 | `DuelHud.tsx` |

> 5 프리셋 색 (빨강 제외): 시안 `#38bdf8` / 그린 `#4ade80` / 퍼플 `#a78bfa` / 마젠타 `#e879f9` / 옐로우 `#facc15`.

### Phase 10a — 디스패처 인프라 (~3h, 에셋 0 의존)

`useDuelLoop.impactEvents` ref 큐 → zustand 단일 진입점 패턴으로 마이그레이션. Phase 11(서버) 때 outcome 수신 경로가 같은 디스패처 호출 한 줄로 끝나도록 미리 정착.

| # | 작업 | 신규 파일 |
|---|---|---|
| 6 | `useTimeScale` zustand 스토어 + `useScaledFrame` 헬퍼 (per-system delta scaling) | `client/src/duel/stores/useTimeScale.ts` |
| 7 | `useImpacts` 스토어 — `push(impact)` / `prune(now)` / `subscribe` | `client/src/duel/stores/useImpacts.ts` |
| 8 | `useShake` 스토어 — `add(trauma)` / `decay(dt)` (현재 `Duel.tsx` 내부 로직 추출) | `client/src/duel/stores/useShake.ts` |
| 9 | `dispatchImpactFx(outcome, ctx)` 단일 함수 — `useDuelLoop` resolver 호출 직후 1곳에서 호출 | `client/src/duel/dispatchImpactFx.ts` |
| 10 | `ImpactRings.tsx` / `Duel.tsx` 셰이크가 새 스토어 구독하도록 변경 | 기존 파일 수정 |

### Phase 10b — 시간/공간 효과 (~3h, 에셋 0 의존)

| # | 작업 | OUTCOME별 수치 |
|---|---|---|
| 11 | hit-stop 4단계 — `dispatchImpactFx`에서 `useTimeScale.hitstop(ms)` | BLOCK 60 / HIT 100 / PIERCE 150 / KO 350 ms |
| 12 | ChromaticAberration ref-mutation pulse | HIT 0→3 / PIERCE 0→5 / KO 0→7 px (BLOCK 제외) |
| 13 | 풀스크린 white flash 1프레임 plane (`renderOrder=999`, `depthTest=false`) | HIT 16 / PIERCE 33 / KO 50 ms (BLOCK 제외) |
| 14 | KO slow-mo envelope (350ms freeze → 0.25× × 650ms → 1.0× 복귀, ease-out cubic) | KO 전용 |
| 15 | Vignette spike on KO | 0→0.40 (600ms) |
| 16 | navigator.vibrate (Android) — feature-detect graceful no-op | BLOCK `[40,30,40]` / HIT `[80]` / PIERCE `[20,20,80]` / KO `[200,100,400]` |

### Phase 9 — Audio (~6h, **SFX 12개 도착 후**)

| # | 작업 |
|---|---|
| 17 | `audiosprite` CLI로 12 OGG → 단일 sprite (`client/public/audio/duel.ogg` + `duel.json`) |
| 18 | howler.js 도입 + sprite playback 모듈 + 모바일 unlock (`client/src/duel/audio/playSfx.ts`) |
| 19 | OUTCOME → SFX 매핑: BLOCK = block + faint pierce X (밝은 메탈), PIERCE = pierce + grunt + sub-bass (어두운 thud), HIT = hit + grunt, KO = ko + crowd stinger |
| 20 | Pitch 랜덤 (±5–8% impacts, ±10–15% whoosh/footstep), velocity-based volume (`lerp(0.6, 1.0, swingForce)`) |
| 21 | windUp 텔레그래프 (rising metallic ring 280ms) + counter window shimmer (sine sweep 400→1200Hz 250ms) — `useDuelLoop` 가 windUp 시작 / counter window 진입 시점에서 dispatch |
| 22 | 60Hz sub-bass synthesized 폴백 (Web Audio `OscillatorNode`, sample 불필요) — iOS 햅틱 폴백 |

### Phase 11 — Ranked Cloudflare multiplayer (Day 2, ~6-8h)

| # | 작업 | 비고 |
|---|---|---|
| 23 | Cloudflare Worker entrypoint + WebSocket upgrade 라우팅 | `/matchmake`, `/leaderboard`, `/ws/:roomId` |
| 24 | `RankedQueue` Durable Object — ELO ±200 큐, 30초 후 범위 확장 | 사설방보다 랭크 P0 |
| 25 | `DuelRoom` Durable Object — `shared/combat/resolver` 서버 권위 호출 | 클라는 입력/가드 snapshot만 송신 |
| 26 | `playerId`, `name`, `saberColor`, `rating` payload 연결 | Phase 9.5 localStorage 값 그대로 송신 |
| 27 | ELO(K=32) 저장 + Top 20 leaderboard | DO SQLite 우선, KV cache 선택 |
| 28 | 서버 outcome 브로드캐스트 → 클라 `dispatchImpactFx(outcome, ctx)` 한 줄로 흡수 | Phase 10a 인프라가 깔려 있으면 추가 시간 0 |
| 29 | 인터폴레이션 버퍼 + hit-stop은 클라 visual 전용 | 서버 sim tick 30Hz minimum / 60Hz preferred |

### Phase 11.5 — Sparks 파티클 (~2h, 에셋 0 의존)

선택 시점: Phase 10b 끝나고 audio 대기 중이거나, Phase 11 끝나고 잔여 시간에.

| # | 작업 | OUTCOME별 |
|---|---|---|
| 30 | `InstancedMesh` + vertex shader (`pos = position + velocity * uTime + 0.5 * gravity * uTime²`) | BLOCK 시안 8–12개 / HIT 마젠타 5–10개 / PIERCE 오렌지+회색 cloth 15개 / KO 흰→마젠타 30개 + ring shockwave |

### Phase 12 — 캐릭터 메시 통합 (~3–5h, **Quaternius/Mixamo 도착 후**)

| # | 작업 |
|---|---|
| 31 | `gltf-transform` (Draco + Meshopt + WebP)로 base GLB ~120KB까지 압축 |
| 32 | (필요 시) Blender에서 6 Mixamo anim을 base에 bind → multi-clip GLB 단일 export. retarget 실패 시 `SkeletonUtils` 런타임 합성 시도 |
| 33 | `useGLTF` + `useAnimations` 훅으로 placeholder 박스 → 후드 몽크 메시 교체. AttackKind/Phase별 anim state machine (idle / windup / slice / thrust / block / hit / death) |
| 34 | 사이드별 머티리얼 인스턴스 분리 + Fresnel rim 셰이더 적용 (Phase 9.5의 placeholder rim 그대로 이식) |
| 35 | drei `<Trail>`을 캐릭터 손 본 (Mixamo `mixamorig:RightHand`)에 부착하도록 변경 |

### Phase 13 — 배포 (Day 2 끝, ~2h)

| # | 작업 |
|---|---|
| 36 | Cloudflare Pages 또는 Vercel 배포 (client static) — env에 Worker URL 분기 |
| 37 | Cloudflare Worker + Durable Objects 배포 (`RankedQueue`, `DuelRoom`) |
| 38 | 잼 컴플라이언스 체크리스트 (`docs/vibe-jam.md` §8): AI 코드 비율 ≥90%, 즉시 로딩, 즉시 멀티플레이 |
| 39 | iOS Safari 자이로/터치 sanity check (P2지만 30초 컷에서 reject 회피) |

---

## 2. 사용자 수집 가이드 (병렬 진행)

### 2.1 SFX 12개 (~1.5h, ★ 우선)

저장 위치: `client/public/audio/raw/<파일명>` — OGG 또는 WAV. 후처리(audiosprite, 볼륨 정규화)는 AI가 함.

음색 의도: **block은 "밝은 메탈 spark"**, **pierce는 "어두운 thud"**으로 음색 정반대를 의도적으로 골라줘 — 이게 BLOCK vs PIERCE 룰 가독성 핵심 (`research_impact_feedback_20260429.md` §3.2.2).

| # | 파일명 | 키워드 | 변형 수 | 비고 |
|---|---|---|---|---|
| 1 | `swing.ogg` | "katana swing", "sword whoosh", "blade air" | **3** (light/med/heavy) | 200–400ms, 1–4kHz 광대역 |
| 2 | `windup.ogg` | "metal ring rising", "sword charge", "tension hum" | 1 | 280ms, 일관성 위해 피치 랜덤 ±3%만 |
| 3 | `block.ogg` | "metal clang bright", "sword spark hit", "high-pitch clash" | **2** | **고주파 spark + bright metal**. flesh 0, sub-bass 최소 |
| 4 | `pierce.ogg` | "dark thud", "low metallic scrape", "armor pierce" | 1 | **저주파 thud + cloth tear scrape**. block과 음색 정반대 |
| 5 | `hit.ogg` | "body thud impact", "punch flesh", "anime hit" | **2** | thud + sub-bass enhancer |
| 6 | `grunt.ogg` | "male grunt short pain", "fighter exhale" | 1 | 분리 — stun/KO 시 재트리거 |
| 7 | `footstep.ogg` | "footstep dirt", "boot step soft" | **3** | low-poly 톤에 맞게 약하게 |
| 8 | `counter_open.ogg` | "rising shimmer", "magic charge sparkle", "sine sweep up" | 1 | 250ms, BLOCK 후 600ms counter window 진입 신호 |
| 9 | `ko.ogg` | "heavy thud body fall", "knockout impact" | 1 | 라운드당 1회만 |
| 10 | `bell_round_start.ogg` | "boxing bell", "round bell ding" | 1 | |
| 11 | `countdown_beep.ogg` | "ui beep short", "countdown tick" | 1 | 피치 3종(0.9/1.0/1.1)은 코드에서 |
| 12 | `victory_stinger.ogg` | "victory fanfare short", "win stinger 8bit" | 1 | 매치 종료 시 |

**소스 우선순위**:

1. **Sonniss GameAudioGDC** — https://sonniss.com/gameaudiogdc — royalty-free 상업 OK, 매년 무료팩(수백GB), 검술/전투 풍부. **가장 안전**.
2. **Freesound.org** — https://freesound.org — CC0 필터 켜고 검색. 무료 계정 필요. 키워드 예: "katana whoosh", "metal clang", "sword unsheath", "body thud", "grunt male short".
3. **Kenney.nl** — https://kenney.nl/assets?q=audio — CC0, "Impact Sounds" / "RPG Audio" 팩.
4. **Pixabay Sound Effects** — https://pixabay.com/sound-effects/ — Pixabay license (상업 OK). 키워드: "sword fight", "metal clang", "anime hit".
5. **Mixkit** — https://mixkit.co/free-sound-effects/sword/ — sword 카테고리 직링크.

**길이/음질 제약 없음** — 한 파일 200ms~2s 사이면 OK. 자르고 페이드 처리, 볼륨 정규화는 audiosprite + ffmpeg로 AI가 함.

**금지**: Star Wars snap-hiss SFX (트레이드마크 침해).

### 2.2 캐릭터 에셋 (~1h)

저장 위치: `client/public/models/raw/` — gitignore 권장.

#### A. Quaternius Universal Base (CC0, 로그인 불필요)

- 다운로드: https://quaternius.itch.io/universal-base-characters
- "Download Now" → free → ZIP → 압축 해제 → `Universal_Base_Mesh.glb` (또는 FBX) 추출
- 저장: `client/public/models/raw/quaternius_base.glb`

#### B. Mixamo 검술 6종 (Adobe 무료 계정 필요)

- https://www.mixamo.com → Adobe ID 로그인
- (옵션 1) Quaternius 베이스 GLB 업로드 → auto-rig 안내(마커 4개) → 6 애니 다운로드
- (옵션 2) Mixamo 기본 캐릭터(Y Bot 등)로 6 애니 다운로드 — 스켈레톤은 동일 (`mixamorig:`)이라 retarget OK
- 다음 6 애니 검색 → **"Without Skin"** + **60 FPS** + **FBX** 다운로드:

| 슬롯 | Mixamo 검색어 | 게임 사용처 |
|---|---|---|
| Idle | `Sword And Shield Idle` 또는 `Sword 1H Idle` | `phase = idle` |
| Slash | `Slash` 또는 `Stable Sword Outward Slash` | `attack.kind = "slice"` swing |
| Thrust | `Sword Thrust` 또는 `Stable Sword Thrust` | `attack.kind = "thrust"` swing |
| Block | `Sword And Shield Block` 또는 `Sword Block Idle` | `guard.active` |
| Hit reaction | `Sword Impact` 또는 `Reaction Hit` | `outcome = hit/pierce` 직후 |
| Death | `Falling Back Death` 또는 `Sword Death` | `phase = roundOver, lastRoundReason = ringout` |

저장: `client/public/models/raw/anim_<slot>.fbx` (예: `anim_idle.fbx`, `anim_slash.fbx`, ...)

#### C. (옵션) Blender 합성

- Blender 있으면: 6 애니를 base에 bind → 단일 multi-clip GLB(`character.glb`)로 export. drei `useGLTF` + `useAnimations` 직접 소비.
- Blender 없으면: raw FBX 그대로 던져만 줘 — AI가 `gltf-transform` CLI + three.js `SkeletonUtils`로 런타임 합성 시도. retarget 실패 시 다시 부탁.

### 2.3 우선순위

**SFX 12개 > 캐릭터 에셋**.

- SFX 도착 → Phase 9 audio 시작 가능 (가장 큰 청각 갭).
- 캐릭터는 Phase 12에서 통합 — Phase 9.5/10/11 모두 placeholder로 진행 OK.

---

## 3. 진행 상태 체크리스트

| Phase | 상태 | 의존 |
|---|---|---|
| 9.5 Identity + IP polish | ✅ 완료 (2026-04-29, `duel-implementation.md` §9 Phase 9.5) | 없음 |
| 10a 디스패처 인프라 | ⬜ | 없음 |
| 10b 시간/공간 효과 | ⬜ | 10a |
| 9 Audio | ⬜ | **SFX 12개 도착** |
| 11 Ranked Cloudflare multiplayer | ⬜ | 9.5, 10a |
| 11.5 Sparks 파티클 | ⬜ | 10a |
| 12 캐릭터 메시 통합 | ⬜ | **Quaternius + Mixamo 도착**, 9.5(rim 셰이더 패턴) |
| 13 배포 | ⬜ | 11 |

각 Phase 완료 시:
1. `yarn workspace @vibejam/shared build && yarn workspace @vibejam/client typecheck` 통과
2. `docs/duel-implementation.md` §3 사용자 피드백 표 + §8 미해결 + §9 작업 히스토리에 결과 반영
3. 본 문서 체크박스 갱신

---

## 4. 스킵 / 비추천 (`research_impact_feedback_20260429.md` §5.4)

- **`three-nebula` 파티클** — 80KB + 복잡한 config, 잼 규모(~200 동시 파티클)에 over-spec
- **per-object Motion Blur** — velocity buffer pass 비싸, 모바일 ~25% FPS 손해
- **DoF 항시** — depth pass 모바일 FPS 박살. KO replay 윈도우만 가능
- **Capacitor 네이티브 쉘** (iOS 햅틱용) — 앱스토어 배포 일정 잼 부적합. audio sub-bass 폴백으로 충분
- **Switch Sports snap-hiss SFX** — 트레이드마크 침해
- **WCAG 위반 chained flash** — 3-flash/sec 룰. 우리 cooldown 600ms에서 자동 충족, 단 boss-rush 모드 도입 시 주의

---

## 5. 참조

- `docs/duel-implementation.md` — 현재 빌드 상태 단일 진실 소스 (Phase 8까지)
- `docs/game-design.md` §6.1 — 잼 일정 / Day 1 / Day 2 / P2 폴리시 우선순위
- `docs/ranked-multiplayer-cloudflare.md` — 무료 범위 랭크 1v1 서버/배포 전략
- `claudedocs/research_impact_feedback_20260429.md` §2.1 — OUTCOME별 정량 시퀀스 표 (hit-stop ms, 셰이크 trauma, CA px, 햅틱 패턴)
- `claudedocs/research_impact_feedback_20260429.md` §6 — zustand 스토어 + `dispatchImpactFx` 코드 패턴
- `claudedocs/research_character_weapon_customization_20260429.md` §3.4 — 라이트세이버 R3F 렌더 (코어 화이트 HDR + 시안 halo + Bloom)
- `claudedocs/research_character_weapon_customization_20260429.md` §4.3 — 잼 미니멈 커스터마이징 (이름 + 색)
- `claudedocs/research_character_weapon_customization_20260429.md` §5.2 — Mixamo 검술 6 애니 워크플로
- `claudedocs/research_character_weapon_customization_20260429.md` §7 — IP-안전 네이밍

---

**End of Jam Polish Plan**
