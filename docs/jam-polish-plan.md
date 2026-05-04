# Chambara Duel — 잼 출시 폴리시 계획

> **작성**: 2026-04-29 (Phase 8 = Day 1 시각 P0 완료 직후)
> **마지막 갱신**: 2026-05-01 잼 마감 당일 (Phase 18 = D-day 최종 튠 반영)
> **잼 마감**: 2026-05-01 13:37 UTC
> **위치**: Day 1 P0 → 본 문서(Phase 9.5/10) → Day 2 랭크 서버(Phase 11) → 배포(Phase 13) → Audio(Phase 17) → D-day 최종 튠(Phase 18, 잼 마감 당일)
> **선행 리서치**:
> - `claudedocs/research_impact_feedback_20260429.md` — 시각·청각·햅틱·시간·공간 5축
> - `claudedocs/research_character_weapon_customization_20260429.md` — 캐릭터·무기·커스터마이징
> - `claudedocs/research_chambara_visuals_20260429.md` — Bloom·트레일·물 (Phase 8에서 적용 완료)
> - `claudedocs/research_audio_sfx_bgm_20260430.md` — 오디오 SFX/BGM (Phase 17에서 적용 완료)
>
> **현 빌드 상태**: `docs/duel-implementation.md` (Phase 18까지 반영, §3.6 + §9 history)

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

| # | 작업 | 상태 | 비고 |
|---|---|---|---|
| 23 | Cloudflare Worker entrypoint + WebSocket upgrade 라우팅 | ✅ 11a/11c | `/healthz`, `/leaderboard`, `/me`, `/matchmake`, `/rooms/:id`, `OPTIONS` |
| 24 | `RankedQueue` Durable Object — ELO ±200 큐 | ✅ 11a/11.6 | storage-backed waiting list + polling dedupe. 30s 범위 확장은 P2 |
| 25 | `DuelRoom` Durable Object — 권위 호출 | ✅ 11a | hello/ready/guard/attack 핸들링, alarm 30Hz tick, ringout/timeout, matchOver+ELO |
| 26 | `playerId`, `name`, `rating`, `saberColor` payload 연결 | ✅ 11a/11b | 클라 localStorage identity/rating 송신 포함 |
| 27 | ELO(K=32) 산출 | ✅ 11a/11c | matchOver payload + Leaderboard DO 영속화 |
| 28 | 서버 outcome 브로드캐스트 (`impact` 메시지) | ✅ 11a | 클라 흡수는 Phase 11b + 10a 디스패처 |
| 29 | 30Hz `state` broadcast (fighter posX/velX/guard/stun/cooldown) | ✅ 11a | 이동 입력 채널 없음 — outcome-driven movement (`applyOutcome` velX → `tickFighter` 적분) |
| **11b** | **클라 네트워크 어댑터** | ✅ 완료 | `useRankedMatch` 훅 + `network/{types,matchmake,RankedClient}` — TitleScreen에 Solo/Ranked 토글, /matchmake 폴링, WS hello/ready/guard/attack, `state` posX lerp 인터폴레이션, `impact` → `dispatchImpactFx`, RankedOverlay (queue/connecting/match_over) |
| **11c** | **퍼시스턴스 + 리더보드** | ✅ 완료 | `Leaderboard` DO (`worker/src/leaderboard.ts`) — `storage.put/get/list` 기반 (KV 인터페이스, SQLite-backed via `new_sqlite_classes`). `playerId → {name, rating, wins, losses, draws, updatedAt}`. matchOver → DuelRoomSession `onMatchOver` 콜백 → DuelRoom이 fire-and-forget으로 internal POST /result 송신. 클라 `/leaderboard` Top 20 + `/me` 라우팅, `LeaderboardView` 컴포넌트 (TitleScreen에 "View Leaderboard" 진입). 30 → 42 worker tests |
| **11d** | **배포** | ✅ Phase 13 | `wrangler deploy` (worker) + `wrangler pages deploy` (client) — 라이브 |

### Phase 11e — Private rooms (~1h, 에셋 0 의존)

| # | 작업 | 상태 |
|---|---|---|
| 40 | Private Room code 입력/생성 → `/rooms/private-{code}` 직접 WS 연결 | ✅ |
| 41 | 사설방 결과가 랭크 리더보드와 local rating에 반영되지 않도록 `record=0` 처리 | ✅ |
| 42 | Tournament UI 비활성화 | ✅ |
| 43 | 자동 브래킷 상태/승자 집계 Durable Object | ⬜ P2 |

### Phase 11.5 — Sparks 파티클 (~2h, 에셋 0 의존)

선택 시점: Phase 10b 끝나고 audio 대기 중이거나, Phase 11 끝나고 잔여 시간에.

| # | 작업 | OUTCOME별 |
|---|---|---|
| 30 | ✅ `THREE.Points` + 커스텀 ShaderMaterial (`pos = origin + v·t + ½·g·t²`) — `useImpacts` 구독 ring-buffer 풀 (`SparkParticles.tsx`) | BLOCK 시안 10 / HIT 마젠타 9 / PIERCE 오렌지(60%)+회색(40%) 15 / KO 흰(50%)+마젠타(50%) 30. AdditiveBlending + Bloom-passing 색상 boost |

### Phase 12 — 캐릭터 메시 통합

**2026-04-30 결정**: 사용자 피드백 "동글동글 귀여운 레퍼런스 스타일" → Quaternius "Superhero" 시리즈는 사실적 톤이 Phase 8 저폴리·neon 글로우와 충돌, Mixamo retarget 디버깅 리스크 1일 마감에서 부담. **자산 미사용·procedural Mii 풍으로 전환**. 자산은 `client/public/models/`에 보존(잼 후 폴리시·`?demo=character` 후보).

| # | 작업 | 상태 |
|---|---|---|
| 31 | `gltf-transform` 압축 — 자산 미사용으로 N/A | ⬜ skip |
| 32 | Blender Mixamo retarget — 자산 미사용으로 N/A | ⬜ skip |
| 33 | placeholder 박스+sphere → **큐트 Mii 풍 prim 합성** (머리/머리카락/눈/egg-torso/어깨/팔×2/손/다리×2/발×2). 양팔은 매 프레임 `currentSwordPose.fromBladePlane`을 follow하는 IK — slice/thrust/guard/idle 모두 sword pose가 결정, 별도 anim 불필요. resolver 상수(`SHOULDER_Y`/`BODY_HEIGHT` 등) 그대로 — 게임 로직 0 영향 | ✅ |
| 34 | Fresnel rim을 **가드 텔로 재해석** — body 5개 머티리얼은 중립(rim 미적용), `swordMaterial`에만 적용 후 `s.guard.active ? accent : black`로 lerp. Three r155+ chunk 리네임(`output_fragment` → `opaque_fragment`) 매칭 버그 동시 수정 — Phase 9.5(c) body rim은 처음부터 silently no-op이었음 | ✅ |
| 35 | Trail을 손 본에 부착 — 현재 검 끝 그대로(prim 합성에 본 없음). 폴리시 단계에서 `handsRef` 위치를 trail anchor로 옮기면 동등 효과 | ⬜ P2 |
| 35a | **Phase 14**에서 xbot/ybot Mixamo 리깅으로 전환(prim 합성 폐기), **Phase 18 e959f05**에서 슬래시 8방향 클립(45°·225° oneHand/twoHands variant) + 전용 Stun reaction 클립으로 attack 모션 다양화 완료. **Phase 18 6c01bcc** hips root motion 25% 댐핑으로 클립 슬라이딩 fix | ✅ |

### Phase 13 — 배포 (Day 2 끝, ~2h)

| # | 작업 | 상태 |
|---|---|---|
| 36 | Cloudflare Pages 클라 배포 — `chambara-duel.pages.dev`, `VITE_WORKER_URL` build-time embed | ✅ |
| 37 | Cloudflare Worker + DO 배포 — `chambara-ranked-worker.200tiger1.workers.dev`, RANKED_QUEUE/DUEL_ROOM/LEADERBOARD v1+v2 마이그레이션 | ✅ |
| 38 | 잼 컴플라이언스 체크리스트 (`docs/vibe-jam.md` §8): AI 코드 비율 ≥90%, 즉시 로딩, 즉시 멀티플레이 | ⬜ (잼 마감일 검증) |
| 39 | iOS Safari 자이로/터치 sanity check (P2지만 30초 컷에서 reject 회피) | ⬜ |
| 39b | 두 창 라이브 매칭 smoke test — Solo/Ranked → queue → match → state → impact → matchOver → leaderboard | ⬜ (사용자 브라우저) |
| 39c | **Phase 18 잼 D-day 최종 튠** (2026-05-01): 8방향 슬래시 + Stun reaction, hips root motion 25% 댐핑, 봇 가드 연속 스무딩, 옵저버 가드/blade tip facing flip 보정, spawn 거리 ±1.5 확장, 넉백 전 프리셋 0.75× 재튠, 솔로 replay BGM 트리거, 페이지 title. 자세한 내용: `duel-implementation.md` §3.6 + §9 Phase 18 | ✅ |

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
| 10a 디스패처 인프라 | ✅ 완료 (2026-04-29, §9 Phase 10a) | 없음 |
| 10b 시간/공간 효과 | ✅ 완료 (2026-04-29, §9 Phase 10b) | 10a |
| 9 Audio | ✅ 완료 (2026-05-01) | 없음 (사용자 자료 + Web Audio 합성) |
| 11a Cloudflare 권위 룸 + state broadcast + CORS | ✅ 완료 (2026-04-29, `worker/`) | 없음 |
| 11b 클라 네트워크 어댑터 | ✅ 완료 (2026-04-29, §9 Phase 11b) | 11a, 10a |
| 11c 퍼시스턴스 + 리더보드 | ✅ 완료 (2026-04-29, §9 Phase 11c) | 11a |
| 11.5 Sparks 파티클 | ✅ 완료 (2026-04-29, §9 Phase 11.5) | 10a |
| **11.6 Audit pass + 신뢰성 패치** | **✅ 완료 (2026-04-29, §9 Phase 11.6, 12 patches, 46/46 tests)** | **11a–c, 11.5** |
| 11e Private rooms | ✅ 완료 (2026-04-29, 49/49 worker tests) | 11b |
| 12 캐릭터 메시 통합 | ✅ Mii prim → Phase 14 xbot/ybot Mixamo 전환 → Phase 18 8방향 슬래시 + Stun + root motion 댐핑으로 마감 | 9.5 / 14 / 17 / 18 |
| **13 배포** | **✅ 완료 (2026-04-29, Workers `chambara-ranked-worker.200tiger1.workers.dev` + Pages `chambara-duel.pages.dev`)** | 11.6 |
| **17 Audio 통합** | **✅ 완료 (2026-05-01, db003db, §9 Phase 17)** — 21 SFX + 4 BGM + 2 ambient + reactive saber hum + Credits 모달 | 사용자 자료 + Web Audio |
| **18 잼 D-day 최종 튠** | **✅ 완료 (2026-05-01, §3.6 / §9 Phase 18)** — 8방향 슬래시·Stun·root motion 25%·봇 스무딩·옵저버 미러링·spawn ±1.5·넉백 0.75×·BGM replay·page title | 17 |

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

- `docs/duel-implementation.md` — 현재 빌드 상태 단일 진실 소스 (Phase 18까지)
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
