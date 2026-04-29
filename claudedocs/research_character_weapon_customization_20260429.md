# Chambara Duel — 캐릭터 / 무기 / 커스터마이징 리서치

> **목적**: 라이트세이버 톤이 잠긴 1v1 챔버라 듀얼에 맞는 캐릭터·무기 디자인 방향 + 잼 마감(2026-05-01 13:37 UTC) 안에 실현 가능한 커스터마이징 스코프 + 에셋 파이프라인 제안.
> **작성일**: 2026-04-29
> **선행 문서**: `docs/duel-implementation.md`, `docs/game-design.md`, `claudedocs/research_chambara_visuals_20260429.md`, `docs/tripo3d.md`
> **출력 정책**: 리서치 보고서. 코드 변경 없음. 구현은 사용자 결정 후 별도 단계.
> **방법**: 두 deep-research 에이전트 병렬 실행 — Tavily 웹검색 + 1차 출처 추출.

---

## Executive Summary (60초 컷)

1. **실루엣이 클립 가치를 만든다** — Nidhogg/Killer Instinct 사례, Dan Fornace의 "fighting game silhouette first" 원칙. 폴리·텍스처보다 후드/케이프/어깨선 같은 윤곽이 30초 클립에서 게임을 식별시킴. (High)
2. **권장 아키타입 = 후드 몽크(hooded monk)** — 단일 클로스 메시로 손/발 디테일 은폐, Star Wars IP 직접 회피, 라이트세이버 SF 톤과 자연스럽게 연결. 두 번째 옵션으로 네온 로닌(neon ronin) 팔레트 스왑. (High)
3. **사이드 ID는 유니폼 색이 아니라 블레이드 + Fresnel rim** — For Honor가 팀 팔레트에서 글로우 림으로 전환한 패턴. 플레이어=시안, 상대=앰버/마젠타. 빨강 회피(Sith 코딩, 가장 IP 분쟁 위험). (High)
4. **싱글 블레이드만 v1, 더블 블레이드는 같은 히트박스 비주얼-온리 스킨으로 stretch** — 크로스가드/커브드/듀얼 와일드는 잼 30초 룰에 시각 변별이 약하거나 결정론 깨짐. (High)
5. **잼 출시 커스터마이징 = 이름 + 세이버 색 5프리셋** — Beat Saber/.io 게임 표준 패턴. localStorage 저장, ~23 B로 Colyseus join 시 한 번 전송, 듀얼 중 0 B. Day 1에 3시간이면 끝. (High)
6. **에셋 파이프라인 = Quaternius CC0 베이스 + Mixamo 검술 6종 + (옵션) Tripo3D 1-2개 hero** — Synty는 라이선스 차단, Tripo는 auto-rigging 품질 검증 필요로 fallback 필수. Quaternius 베이스 1종을 gltf-transform으로 ~120 KB까지 압축해서 인라인. (High/Medium)
7. **Day 1 우선순위는 시각 P0 (Bloom·트레일·임팩트·물·KO splash)이 먼저**, 캐릭터 메시·커스터마이징은 그 뒤. P0이 6-10시간 → 캐릭터 풀스크래치는 안 됨. **현실적 제안: 잼 출시 = 박스+스피어 placeholder 유지하되 toon shader + emissive 처리 + 이름/색 커스터마이저만 추가, 캐릭터 메시는 post-jam Week 1.** (Medium-High)

---

## 1. 컨텍스트 — 우리 게임의 기존 결정 / 제약

| 항목 | 현재 상태 |
|---|---|
| 테마 | **SF 라이트세이버** (Phase 7 결정, 2026-04-29) — 시안 코어 + 화이트 HDR + selective Bloom |
| 카메라 | 캐릭터 바로 뒤+살짝 위, Z 추격 lerp (Phase 7 완료) |
| 캐릭터 메시 | **box+sphere placeholder** (1.7 unit 박스 + 0.3 unit 머리), `transparentWhenIdle` 32% 투명도 |
| 무기 | **BASIC_SWORD 1종** — 단일 segment, phase-based 포즈, `bladeLength=1.2`, `SWORD_FORWARD_OFFSET=1.6` |
| 결정론 제약 | `shared/combat/`는 순수 함수 — 가시적 변형은 visual-only여야 함, 권위 서버/리플레이 호환성 유지 |
| 잼 일정 | Day 1 = 시각 P0 (6-10h), Day 2 = Colyseus DuelRoom + 사설방/토너먼트 + 랭크 + Vercel 배포 |
| 번들 | 현재 1.25 MB / gzip 353 KB. 추가 가능 예산 ~600 KB |
| 입력 | 마우스 전용 PC 1차. 모바일은 P2 |

**관찰**: 잼 일정상 캐릭터/커스터마이징은 사실상 **P2 폴리시** 또는 **post-jam Week 1**. Day 1의 시각 P0 (Bloom·트레일·물·KO splash)이 30초 클립 가치의 90%를 만듦. 캐릭터 풀스크래치는 시각 P0보다 우선순위 낮음. → **잼 출시 = placeholder + 이름/색 커스터마이저**, 메시 교체는 시각 P0 종료 후 시간 남으면.

---

## 2. 캐릭터 디자인

### 2.1 레퍼런스 인벤토리

| 게임 | 핵심 학습점 |
|---|---|
| **Nidhogg (2014)** | 단색 실루엣 스틱 피겨. "어떤 프레임에서 봐도 의도가 보임"이 디자인 기둥 — 경쟁 게임의 가독성은 충실도가 아닌 윤곽으로 결정. |
| **Nidhogg 2** | 본 디테일 추가 후 가독성 하락 → 커뮤니티 반발. **반증 사례**: 1v1 펜서에서 디테일 추가는 위험. |
| **For Honor** | 팀 팔레트 강제 → **글로우 블루 림 + 컬러 nameplate**로 전환. 사이드 ID 모범 답안. |
| **Jedi: Fallen Order** | Cal Kestis의 판초가 "숨은 제다이" 실루엣 티저로 의도 설계됨. 단일 클로스 피스가 정체성 운반. |
| **Beat Saber** | 1인칭 VR이라 몸은 안 보임 → **세이버 자체가 캐릭터**. 우리 룩에 강한 시사 — 몸을 단순하게 가도 된다는 증거. |
| **Absolver** | 얼굴은 마스크, 정체성은 의상/마스크 실루엣. "얼굴 안 만들기" 정당화. |
| **Hellish Quart** | 포토그래메트리 실사. **잘못된 fit 사례** — 잼 클립에서 "팝"이 안 남. |
| **Killer Instinct / Rivals (Fornace)** | "격투 게임에서 실루엣은 가장 중요. 안티시페이션 프레임의 포즈 실루엣은 상대가 읽을 수 있는 몇 안 되는 단서." |

### 2.2 1v1 세이버 듀얼용 실루엣 원칙 (3-4 unit 카메라 거리)

- **수직 비대칭**: 머리 모양 + 어깨선 + 힙선 = 3개 읽히는 매스. 단순 캡슐은 실패. 후드 + 어깨 케이프 + 테이퍼드 다리가 어떤 각도에서도 람다 형태로 읽힘.
- **포즈 모양 > 모델 모양**: Fornace 원칙. 가드 자세는 wide+low T, 윈드업은 spike. 우리 전투는 이미 windUp 텔레그래프 시스템이 있음 → **애니메이션 예산이 폴리 카운트보다 ROI 큼**.
- **앵커 컬러 블록**: 토르소에 큰 단색 한 개 (Cal의 오렌지 판초 룰). 360p 트위터 압축에서도 읽힘.
- **사이드 ID = 블레이드 + 림**, 절대 유니폼 아님. For Honor의 "팀 팔레트 제약 제거 → 글로우 블루 동맹 림" 반복이 가장 싼 해법: 몸은 중립 톤, **(a) 세이버 색 + (b) 얇은 Fresnel rim 셰이더(시안 vs 앰버)** 로 정체성 분리.

### 2.3 스타일라이즈이션 권장

**선택: 로우폴리 flat-shaded + 토온풍 hard rim, MeshToonMaterial은 비추천.**

이유:
- Three.js `MeshBasicMaterial`이 가장 쌈. iOS에서 Lambert→Phong 전환 시 60→15 FPS 떨어진 벤치 있음. flat-shaded는 BasicMaterial + 버텍스 컬러 → 사실상 무료.
- 5라인짜리 커스텀 Fresnel rim 셰이더가 "애니 cel" 룩을 줌. MeshToonMaterial의 그라디언트맵/섀도우 패스 비용 회피.
- 번들: Mixamo 로우폴리 캐릭터 ~324 트라이앵글, gzip 후 100 KB 미만. 캐릭터 2종 + 애니 6종 = 500 KB 미만.
- **PBR (`MeshStandardMaterial`)는 몸에 절대 쓰지 말 것** — Bloom이 어차피 라이팅을 지움.

### 2.4 5개 아키타입 후보

| 아키타입 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **후드 몽크** (로브 + 후드, 얼굴 X) | 한 컷 실루엣 최강. 손/발 은폐. 리깅 단순. Hyper Light Drifter / Journey 톤으로 Star Wars 회피 | 정체성 변별성 낮음 | **★ 1차 추천** |
| **네온 로닌** (스타일라이즈드 하카마 + 하프 마스크) | 어깨선 강함. "세이버=검" 자연스러움. Ghost of Tsushima 톤 | 비대칭 마스크 리깅 부담 | 2차 — 팔레트 스왑으로 출시 |
| **Absolver 듀얼리스트** (마스크 + 튜닉) | 얼굴 문제 무료 해결. 사쉬 라인이 좋은 실루엣 | 제네릭 Souls NPC로 보일 위험 | 백업 |
| **추상 지오메트리** (Mr Game & Watch 풍 블록 피겨) | 가장 쌈. 100% 결정론적. 아이코닉 클립 | "placeholder ship됨"으로 읽힘 → stretch goal 약화 | 시간 부족 시 |
| **아머드 나이트** (For Honor) | 무게감 | 플레이트는 디테일 필요 → PS1 룩 위험. 톤 충돌 | 스킵 |

**구체 제안**: 동일한 후드 몽크 2개. 플레이어 = 시안 림 + 시안 블레이드. 상대 = 마젠타/앰버 림 + 같은 색 블레이드. 몸은 ~500 트라이앵글 캡슐 + 별도 떠다니는 클록 메시. 얼굴은 평면 검정(리그 X). 1일 안 가능.

---

## 3. 무기(라이트세이버) 디자인

### 3.1 힐트 해부와 디테일 예산

캐논 힐트 = **emitter, neck/shroud, body/grip, activator, pommel**. 3-4 unit 카메라 + Bloom으로 블레이드가 날아가는 환경에서 **emitter+grip+pommel 실루엣만 의미 있음**.

권장 예산:
- **힐트 메시**: 100-200 트라이앵글, 단일 CylinderGeometry + emitter flare용 2개 segment cut + activator용 작은 박스
- 단일 256×256 그레이스케일 메탈 텍스처 (또는 vertex color로 더 쌈)
- pommel = 6-8각 작은 실린더, vent slot은 normal-map 스트립 1개 quad
- **총 힐트 GLB ~5 KB**, 2종 변형이 stretch goal로 적정

### 3.2 블레이드 변형 카탈로그

싱글이 30초 클립에서 즉시 "라이트세이버"로 읽히는 유일한 실루엣. 나머지는 관객이 파싱해야 함.

| 변형 | 실루엣 변화 | 게임플레이 영향 (캐논) | 잼에 출시? |
|---|---|---|---|
| **싱글** (Luke/Anakin) | 베이스 | 균형 | **★ 디폴트** |
| **더블 블레이드** (Maul) | 즉시 다른 캐릭터로 읽힘 | "회오리, 예측 어려움" | **stretch — 비주얼 온리 스킨, 양쪽 동일 히트박스로 결정론 유지** |
| **크로스가드** (Kylo) | emitter 양쪽 짧은 사이드 블레이드 | "헤비 스윙" | 보류 — 사이드 블레이드가 충돌 모호함 |
| **커브드 힐트** (Dooku) | 옆에서만 보임 | "범위, 정밀" | 스킵 — 잼 카메라에서 안 보임 |
| **듀얼 와일드** (Ahsoka) | 양손 빛, 매우 다른 자세 | "속도, 방어" | 스킵 — 입력/애니메이션 2배 |
| **쇼토** (12-24인치) | 짧은 블레이드 | "속도, 민첩" | 스킵 |

**최종 제안**: 싱글 블레이드만 v1. 시간 +2시간 남으면 더블 블레이드 비주얼 스킨 추가 — 양쪽 끝에 동일 hitbox 두면 `shared/combat/`의 결정론 깨지지 않고 클립에서 "다른 캐릭터처럼 보임" 효과.

### 3.3 컬러 팔레트

캐논: **블루**(가디언), **그린**(consular), **레드**(Sith, "bled"), **퍼플**(균형), **옐로우**(Temple Guard), **화이트**(정화).

우리 시안-잠긴 톤에서:
- **플레이어**: 시안 코어 + 화이트 HDR halo (이미 잠김)
- **상대**: **앰버/오렌지** 또는 **마젠타** — **빨강 회피**. 이유:
  - (a) 빨강은 가장 Sith-coded → 법적 위험 가장 큼
  - (b) 시안-vs-앰버는 LCH 휠에서 hue contrast 최대, Bloom bleed 후에도 살아남음
  - (c) 마젠타 = "퍼플" 캐논 네약 (Mace Windu 톤 회피하면서)
- **그린은 완전 회피** — Star Wars 두 번째로 아이코닉 + 환경 식물과 혼동 위험

### 3.4 R3F 렌더링 접근 (싸 → 풍부)

1. **가장 싸게, 즉시 출시 가능 (~30분)**: 두 개 중첩 cylinder. 코어 = `meshBasicMaterial` `#ffffff` scale 0.04. halo = `meshBasicMaterial` `#00e5ff` `transparent` opacity 0.5 scale 0.08. `<EffectComposer><Bloom intensity={1.5} luminanceThreshold={0.6} mipmapBlur /></EffectComposer>`. 흰 코어가 Bloom 됨, 시안 halo가 안쪽 채도 줌.
2. **+30분**: `toneMapped={false}` + 코어 색 `[10,10,10]` HDR. Three.js 포럼/gamedev.net 캐논 패턴 — "코어 화이트 + Bloom = 라이트세이버".
3. **Selective Bloom (★ 권장)**: 블레이드 메시를 별도 `THREE.Layers`에 두고 `SelectiveBloomEffect` `luminanceThreshold ~0.9`. 모바일 비용 1.5-2배 줄어듦. `mipmapBlur` 절반 해상도.
4. **Stretch — Fresnel halo 셰이더**: `dot(viewDir, normal)`으로 엣지 강도. Bloom 없어도 "빔의 엣지" 룩. low-end fallback.

**모바일 FPS 비용 순위**:
- emissive + 글로벌 UnrealBloom: 중-고 (멀티-패스 블러 비쌈)
- emissive + selective bloom (절반 해상도, mipmapBlur): ~1.5-2배 쌈
- Fresnel-only, no Bloom: 가장 쌈, 비주얼 약함 — quality-toggle fallback

### 3.5 트레일/스윙 FX

- **`<Trail>` from `@react-three/drei`** — MeshLine 기반 선언적 트레일, 블레이드 tip 메시에 attach. `width`, `length`, `decay`, `attenuation`. 정확히 우리가 원하는 프리미티브.
- **`meshline` (pmndrs)** — 빌보드 트라이앵글 스트립, `THREE.Line`보다 훨씬 쌈. `<Trail>`이 충분치 않으면 직접 사용.
- **`useTrail` 훅** — 포인트 배열 raw로 받아 커스텀 셰이더로 트레일 색 그라디언트 가능 (코어 화이트 → 시안).
- **레퍼런스**: Beat Saber 노트 트레일 — 밝은 화이트 코어 + 컬러 외곽 fade, ~0.3s decay. Vader Immortal의 블러 스트릭은 "단일 카드(quad)" — 단순 빌보드가 리본 물리보다 클립에 잘 나옴.

### 3.6 클래시 VFX 어휘

- **스파크 burst** — 접점에서 짧은 파티클, additive blend
- **링 펄스** — flat 팽창 torus/quad, white→transparent ~150 ms (Force Unleashed 패턴)
- **스크린 플래시** — 풀-프레임 additive white tween, ~80 ms, opacity ~0.25
- **카메라 셰이크** — 작게, ~3 프레임 저진폭. "무게감"의 핵심
- **오디오**: 저주파 clack + 고주파 sparkle. **Star Wars snap-hiss는 SFX 트레이드마크 — 사용 금지**
- **힐트 마이크로-jitter** — ~1 cm, 60 ms transform 떨림. Vader Immortal "이펙트를 운전하는 느낌" 디자인 기둥. 매우 싸고 큰 가독성 win.

→ 잼: 결정론적 resolver에서 트리거되는 **단일 `ClashFX` 컴포넌트**로 ring + spark + flash + shake. blade-lock 중 지속 스파크는 스킵 (파티클 카운트 예측 가능하게).

---

## 4. 캐릭터 커스터마이징 스코프

### 4.1 케이스 스터디

| 게임 | 출시한 것 |
|---|---|
| **fly.pieter.com** | 비행기 3종 변형 (무료 Cessna, 유료 F-16 $29.99, "Cyberpink"). **이름 표시 X**, **avatar 커스터마이징 X**. 개인화는 *비행기 선택*으로만. — `vibecoded.co` |
| **agar.io / slither.io** | 이름 (≤24자) + 스킨 (빌트인 팔레트 + 커뮤니티). 계정 X, localStorage. **.io 컨벤션 = 이름 + 1 시각 축, 그 이상 X** |
| **Beat Saber** | 빌트인 세이버 색 (좌/우 hex), 아바타는 커뮤니티 모드. **2개 색 슬롯이 출시 분량** — 우리 미니멈의 정확한 선례 |
| **Roblox 클래식 R6** | 부위별 이산 컬러 슬롯 (head/torso/L-arm/R-arm/L-leg/R-leg), 11 토르소 컬러, BrickColor enum. 6 enum 바이트 |
| **Krunker.io** | 500+ 무기 스킨, 100+ 모자, 5,877 cosmetic. 출시 후 수 년에 걸쳐 — **잼 스코프 아님** |
| **Nidhogg** | P1/P2 컬러 = config 파일. 순수 바이너리 스테이트 |
| **Duck Game** | 4 고정 바디 hex 컬러, 컨트롤러 슬롯에 매핑 |

### 4.2 축 랭킹 (잼-적정성 매트릭스)

| 축 | 노력 | 임팩트 | 동기화 비용 | 잼 fit |
|---|---|---|---|---|
| 플레이어 이름 (≤16자 UTF-8) | XS (1h) | **High** (리더보드, KO splash) | ~16 B | **★ Day 1 출시** |
| 세이버 블레이드 컬러 (5 hex 프리셋) | XS (1h) | **Very High** (시그니처 비주얼) | 1 B (enum) | **★ Day 1 출시** |
| 바디 틴트 (HSL hue 슬라이더, 셰이더 uniform) | S (2-3h) | Medium-High | 2 B | **Day 2 stretch** |
| 캐릭터 메시 (3-5 GLB) | M (4-8h) | High but 번들 부담 | 1 B (enum) | Stretch / Day 2 |
| 힐트 지오메트리 변형 (3 메시) | M (3-5h) | Medium | 1 B | Post-jam W1 |
| 케이프/트레일 컬러 | S (1-2h, 세이버 팔레트 재사용) | Medium | 1 B | Post-jam W1 |
| 헤드기어/액세서리 슬롯 | M (3-6h, rig 소켓) | Medium | 1-2 B | Post-jam W2 |
| 보이스/탠트 | L | Low (단일 화면 듀얼) | 1 B | Future |
| 아이들/포즈 변형 | L (캐릭터별 anim retarget) | Low | 1 B | Future |
| Win-screen 배너/이모트 | L (UI flow 통째) | Medium | 1 B | Post-jam W2+ |
| 언락커블 (Krunker 모델) | XL (currency + 경제) | High (retention) | many B | Future, ranked-tied |

### 4.3 단계별 롤아웃

#### 잼 Day 1-2 (절대 미니멈, ~3시간)

1. **이름 입력** title screen. `localStorage["chambara.name"]` 저장. HP bar 위, KO splash에 렌더.
2. **세이버 색 피커**: 5 프리셋 — 시안(디폴트), 그린, 퍼플, 레드, 옐로우. `localStorage["chambara.saber"]` 저장.
3. `{name, saberColor}` Colyseus `joinOptions`로 전달. `Player` 스키마에 미러.

→ 이것만으로 felt personalization의 90%. Beat Saber + .io 패턴 입증.

#### Post-jam Week 1 (~1일)

4. **바디 틴트** = 셰이더 uniform (HSL hue rotation, 단일 베이스 메시). **추가 GLB 0개**. Quaternius UniversalBase 1개 + fragment shader uniform 1개 = 무한 컬러, 0 KB 추가.
5. **힐트 변형** (3 지오메트리 — 스트레이트, 커브드, 더블블레이드 nub). hand 소켓에 attach, 30-50 KB GLB 추가.
6. **트레일 컬러** = 세이버 컬러 (free, 추가 스테이트 X).

#### 미래 (Week 2+ / 랭크 출시)

7. **메시 슬롯**: 5-7 캐릭터 아키타입 (Quaternius 모듈러 + 1-2 Tripo3D hero).
8. **헤드기어 소켓** (후드, 헬멧, 마스크) — 3-5 GLB lazy-loaded.
9. **언락커블**: 랭크 보상 연동 (exotic blade 색, rare 힐트). retention 메트릭 정당화 시만.
10. **Win-screen 이모트** — Mixamo taunt 애니.

### 4.4 영속성 티어

- **잼 출시**: `localStorage`만. 인프라 비용 0, 즉시 이터레이션. fly.pieter / .io 컨벤션.
- **랭크 출시**: 서버 측 계정 (Colyseus + Vercel KV / Supabase) — stable client ID 키. cosmetic은 entitlement, localStorage 신뢰 X.

### 4.5 멀티플레이 동기화 비용

Colyseus 바이너리 delta 인코딩:

| 필드 | 타입 | 바이트 |
|---|---|---|
| name | string ≤16 chars | ~18 |
| saberColor | uint8 enum | 1 |
| bodyHue | uint16 | 2 |
| meshId | uint8 | 1 |
| hiltId | uint8 | 1 |
| **합계** | | **~23 B** |

`onJoin` 시 1회 송신. **틱당 0 B** (매치 중 불변). 16인 토너먼트 lobby도 ~370 B 1회. 무시할 수준.

---

## 5. 에셋 파이프라인

### 5.1 소스 비교

| 소스 | 라이선스 | Time-to-asset | Polycount | Rig | 추천 |
|---|---|---|---|---|---|
| **Quaternius — Universal Base / Modular Fantasy Outfits** | **CC0** (퍼블릭 도메인) | **15분** 다운로드 → drop | ~1-3k tris | Humanoid, **Mixamo retargetable** | **★ 1차 베이스라인** |
| **Mixamo 캐릭터 + 애니메이션** | Adobe 무료, royalty-free 상업 OK. **raw FBX/GLB 재배포 X**. 컴파일 번들 임베드는 OK | 30-45분/캐릭터 (download + 6 anim + Blender 합치기) | 5-15k tris | Mixamo 스켈레톤 | **★ 애니메이션 항상, 캐릭터는 fallback** |
| **Tripo3D Pro ($11.94/월, 3,000 크레딧)** | Pro = 풀 상업권. Free = no commercial. Auto-rig "Coming Soon" 명시 — 검증 필요 | **60-90분** prompt → rig → Mixamo retarget | 설정 가능 | Auto-rig humanoid (Mixamo 호환 FBX/GLB) | **stretch — hero 1-2개만** |
| **Synty POLYGON Sci-Fi** | **유료만** ($30/월 또는 팩 단위). 무료 starter pack은 **non-commercial** | N/A 무료 잼에 | 1-3k tris | Humanoid | **스킵 — 라이선스 차단** |
| **Sketchfab CC0/CC-BY** | per-asset | 20-40분 | varies | varies (often unrigged 또는 non-Mixamo) | 백업 |
| **OpenGameArt / Itch.io** | per-asset (CC0, CC-BY, GPL) | 20-60분 | varies | varies | 백업 |

### 5.2 Mixamo 검술 애니 팩 (무료, 전부 combat-tagged)

다음 6종이 우리 듀얼 키트 커버:
- **Idle**: Sword 1H Idle, Sword & Shield Idle
- **Slash**: Slash, Cross Slash, Stable Sword Outward Slash
- **Thrust**: Sword Thrust, Sword And Shield Slash
- **Guard / parry**: Sword & Shield Block, Sword Block Idle
- **Stagger / hit reaction**: Sword Impact, Reaction Hit
- **KO / death**: Sword Death, Falling Back Death

**워크플로**:
1. 모든 6 애니를 **동일 Mixamo 캐릭터**로 다운로드
2. FBX without skin로 export → Blender drop
3. Quaternius 메시에 공유 Mixamo 본 명명으로 bind
4. multi-clip GLB 단일 export
5. drei `useGLTF` + `useAnimations` 직접 소비

### 5.3 Three.js 게차

- **다중 인스턴스 SkinnedMesh**: `gltf.scene.clone()` 아님 → `SkeletonUtils.clone(scene)` 또는 drei `<Clone>` (자동 처리)
- **단일 모델 + N 애니**: 모델 1번 로드, 애니는 별도 GLB로, `clip.clone()` push 한 `useAnimations` 인스턴스에
- **Mixamo 본 이름** (`mixamorig:Hips` 등): 모델 + 애니 파일 간 일치 안 하면 retarget 무성공. Blender에서 검증
- **gltf-transform** CLI / `https://gltf.report` — Draco 지오메트리 + Meshopt + WebP 텍스처: 2 MB rigged GLB → ~250-400 KB

### 5.4 Tripo3D 구체

- **Pro 플랜**: 3,000 cr/월, $11.94 (참고: Agent 2가 $19.90 보고했으나 우리 `docs/tripo3d.md`는 $11.94 — 가격은 시점 의존적. 실제 결제 시 재확인). 단순 로우폴리 = 1-2 cr, 미드 = 3-5 cr → 200+ 캐릭터/월.
- **워킹 프롬프트 템플릿**: `"low-poly stylized humanoid, robed cyberpunk warrior, simple geometric shapes, T-pose, single solid colors, flat shading, game-ready, Mixamo-compatible proportions"`. T-pose + 표준 비례 = retarget clean.
- **신뢰도: Medium** — auto-rigging 품질이 prompt/topology에 크게 의존. **Quaternius fallback 필수**.

---

## 6. 번들 / 동기화 예산

### 6.1 캐릭터당 번들 수학

- raw rigged Quaternius GLB: ~200-400 KB
- gltf-transform (Draco + Meshopt + WebP) 후: **~80-150 KB**
- DRACOLoader 디코더 (lazy): ~200 KB 1회, 모든 캐릭터 캐시 공유
- 애니 팩 (6 클립, 공유 스켈레톤): 압축 후 **~80-120 KB**

### 6.2 1.5 MB gzip 타겟에서의 초기 번들 예산

- R3F + drei + three.js 코어 ≈ ~600-700 KB gzip
- 게임 로직 / 셰이더 / UI ≈ ~200 KB
- **에셋 예산 잔여 ≈ ~600 KB**
- → **베이스 캐릭터 1 + 애니 팩 1을 인라인 (~250 KB)**, 추가 캐릭터는 lazy-load

### 6.3 Lazy-load 패턴 (★ 권장)

```
CharacterSelect → user picks → dynamic useGLTF(`/chars/${id}.glb`)
                                → ~120 KB만 스트림
```

drei `useGLTF.preload(url)` — hover에서 fetch 시작. 5 캐릭터 × ~120 KB = **600 KB lazy** (인라인 X).

### 6.4 ★ 권장 접근: 팔레트 스왑, 메시 스왑 X

**Day-1 비주얼 다양성은 셰이더 팔레트 스왑으로** — 텍스처/메시 추가 X:

- 베이스 메시 1개 (~120 KB 압축)
- 공유 셰이더 + `uniform vec3 uBodyTint` (vertex color 또는 grayscale base map과 곱셈)
- 각 플레이어가 hue/RGB을 자기 머티리얼 인스턴스에 `material.clone()` + uniform override로 전달

→ **0 KB 추가 번들**로 무한 컬러 변형. 메시 스왑은 Week 1+ feature, 번들 예산 흡수 가능할 때.

---

## 7. IP-안전 네이밍

### 7.1 보호 대상 (Soundmark Law / Lucasfilm 트레이드마크 출원)

- **"lightsaber"** 글자 자체가 등록 트레이드마크
- **활성화/험/스윙 사운드**가 sonic mark 트레이드마크
- **알려진 캐릭터 힐트의 특정 미적 디자인** (Vader, Maul, Kylo) = 디자인 보호

### 7.2 보호 대상 X

- **에너지/플라즈마 검 일반 컨셉**은 퍼블릭 도메인. Halo "energy sword", Mass Effect "omni-blade", Destiny "Arc Blade" — 자유 사용.

### 7.3 우리 게임 권장 네이밍

- UI 문자열, 파일명, 에셋명, 마케팅 카피: **"plasma blade"** 또는 **"arc saber"**.
- 코드 식별자: `BASIC_SWORD` → `PLASMA_BLADE` 또는 `ARC_BLADE_MK1`. 게임플레이 내부 이름(`bladeColor`, `hiltLength` 등)은 메카닉 — 유지.
- 게임 제목: **"Chambara Duel"**은 이미 좋음 — *chambara* = 일본 검술 영화 장르, 사무라이-coded 프레이밍 (Jedi-coded 아님).

### 7.4 위험 영역

- **"Jedi", "Sith", "Force", "Padawan", "Skywalker"** — 사용 금지
- **"May the X be with you"** 패러디 — 위험
- **snap-hiss SFX** — 트레이드마크 침해
- **brown-robe-with-belt 후드 의상** — Jedi-coded, 시각적으로 위험
- **유명 캐릭터 힐트 실루엣** — 디자인 보호 침해
- **"kyber"** — Lucasfilm-coined 용어, 그레이존, 회피 권장

### 7.5 관할 메모

- **무료 잼 게임**: 위험 최저. Lucasfilm은 비상업 팬워크에 잘 안 따라옴. 트레이드마크 dilution 주장은 상업성 X 필요 X — "lightsaber" 글자 + SFX 회피하면 high-risk zone 탈출.
- **수익화 시**: 트레이드마크 검색 필수. 시각 룩 단독(시안 글로우 블레이드)은 침해 판례 없음 — 너무 generic. 위험은 곱셈으로: "Jedi"/"Sith" + brown robe + snap-hiss + 유명 힐트.
- **EU vs US**: EU 트레이드마크 스코프 좁음, US가 Disney 변호사 운영지. 잼 페이지가 글로벌 청중이면 사실상 US 룰 지배.

---

## 8. 우리 프로젝트에 맞는 구체 액션 플랜

### 8.1 잼 출시 권장 (현실 버전)

**시각 P0 (Day 1, 6-10시간) 종료 후 시간 남는 게 전제**.

| 시간 | 작업 |
|---|---|
| **+30분** | 코드 식별자 리네임 `BASIC_SWORD` → `PLASMA_BLADE`. UI 카피 lightsaber → plasma blade. (IP-안전) |
| **+1시간** | 검 비주얼 = 두 중첩 cylinder (코어 화이트 HDR + 시안 halo). selective Bloom 적용. 가드/스윙 시 emissive intensity 변조. |
| **+30분** | 상대 검만 앰버/마젠타 컬러로 분기 (사이드 ID). 빨강 회피. |
| **+1시간** | drei `<Trail>` blade tip에 부착. width=0.05, decay=0.3, color=blade 컬러 매칭. |
| **+30분** | Title screen에 이름 입력 + 5 프리셋 컬러 버튼 row. localStorage. |
| **+30분** | Colyseus join 시 `{name, saberColor}` payload, Player schema 미러. |
| **+1시간 (stretch)** | 캐릭터 cube → 후드 몽크 캡슐 + 케이프 메시 (procedural, GLB 안 만들고 in-code). MeshBasicMaterial + Fresnel rim 셰이더. |

총 ~5시간. **시각 P0와 합치면 11-15시간.** Day 1에서 빠듯 → 캐릭터 메시 교체는 **잼 후 Week 1**로 이월하는 게 현실적.

### 8.2 박스+스피어 placeholder 유지 시 (★ 더 현실적)

placeholder를 그대로 두고 **시각 P0에 완전 집중**. 그 위에:

- **검 emissive + Bloom + 트레일 + 클래시 FX** = 시그니처 비주얼 (이미 시각 P0)
- **이름 + 세이버 색** = 1.5시간으로 felt personalization 90%
- **상대 검 컬러 분기** = 30분으로 사이드 ID 해결
- **placeholder 캐릭터에 Fresnel rim 시안/앰버** = 30분으로 "두 캐릭터" 시각 구분

= **+3시간 추가**로 잼 전체 30초 룰 달성. 캐릭터 GLB는 post-jam.

### 8.3 Post-jam 로드맵

- **Week 1**: Quaternius 베이스 1 + Mixamo 6 anim → multi-clip GLB → gltf-transform 압축 → 후드 몽크 메시로 placeholder 대체. 바디 hue 슬라이더 추가.
- **Week 2**: 두 번째 아키타입 (네온 로닌) 추가, Tripo3D Pro 1개월 결제하고 hero 캐릭터 1-2종 생성. 힐트 변형 3종.
- **Week 3+**: 헤드기어 소켓, 케이프, 랭크 보상 cosmetic, 언락커블 시스템.

---

## 9. 신뢰도 및 정보 격차

| 항목 | 신뢰도 | 비고 |
|---|---|---|
| 실루엣 우선 원칙 | **High** | Fornace + Nidhogg 사례 일치 |
| For Honor rim 패턴 | **High** | 공식 업데이트 노트 |
| Beat Saber 2-슬롯 컬러가 출시 분량 | **High** | 다수 가이드 |
| MeshBasicMaterial Lambert→Phong FPS 60→15 (iOS) | **Medium** | 단일 벤치 출처, 디바이스 의존 |
| Quaternius CC0 + Mixamo 호환 | **High** | 공식 라이선스 + 다수 사례 |
| Tripo3D auto-rig 품질 | **Medium** | "Coming Soon" 표시 + 사용자 결과 다양 |
| Synty 무료 starter non-commercial | **High** | 라이선스 명시 |
| Colyseus delta 인코딩 ~23 B | **High** | 공식 문서 |
| gltf-transform 2 MB → 250-400 KB | **High** | 다수 사례 |
| "lightsaber" SFX/이름 트레이드마크 | **High** | Lucasfilm 출원 확인 |
| **에너지 검 일반** 안전성 | **High** | Halo/Mass Effect/Destiny 선례 |
| 무료 잼에 Lucasfilm 단속 가능성 | **Medium-Low** | 비상업 팬워크에 일반적 X, 단 dilution 주장은 상업 X 필요 X |
| Tripo3D 가격 ($11.94 vs $19.90) | **Low** | 시점/플랜에 따라 다름 — 결제 시 확인 |

---

## 10. 다음 단계

본 리서치는 보고서 단계까지가 범위. 사용자 결정 항목:

1. **잼 출시 스코프 결정**:
   - (A) placeholder 유지 + 이름·세이버 색만 (3시간) — **★ 권장 (현실)**
   - (B) placeholder + Quaternius 베이스 캐릭터 추가 (5시간)
   - (C) 풀 후드 몽크 + Quaternius + Mixamo (8-10시간) — Day 1 시각 P0와 충돌
2. **컬러 컨벤션 결정**: 상대 = 앰버 vs 마젠타? (시안과의 hue contrast 둘 다 OK)
3. **IP 네이밍 채택**: `BASIC_SWORD` → `PLASMA_BLADE` 리네임 시점 (지금 vs 잼 후)
4. **Tripo3D 결제 시점**: Day 2 stretch에 hero 캐릭터 1개 만들지, post-jam Week 2까지 대기할지
5. **`/sc:design`** — 위 결정 후 컴포넌트 인터페이스 / 상태 구조 설계
6. **`/sc:implement`** — 디자인 후 구현

---

## 출처

### 캐릭터/실루엣
- [Hellish Quart presskit](https://www.hellishquart.com/presskit) | [Wikipedia](https://en.wikipedia.org/wiki/Hellish_Quart)
- [For Honor Team ID Update (Steam)](https://store.steampowered.com/news/app/304390/view/2921104080629858691) | [Ubisoft Team ID Update](https://www.ubisoft.com/en-gb/game/for-honor/news-updates/4xNzN0kjmrQbcGJXXJ4ShL/team-identification-update) | [For Honor Customization Wiki](https://forhonor.fandom.com/wiki/Customization)
- [Nidhogg — Wikipedia](https://en.wikipedia.org/wiki/Nidhogg_(video_game)) | [Why Nidhogg 2 ditched minimalism (Game Developer)](https://www.gamedeveloper.com/design/why-i-nidhogg-2-i-ditches-the-minimalism-of-the-original) | [Nidhogg 2 art overhaul (PC Gamer)](https://www.pcgamer.com/nidhogg-2-creator-explains-radical-art-style-overhaul/)
- [Dan Fornace — Power of Silhouettes](https://fornace.medium.com/fighting-game-design-with-dan-fornace-the-power-of-silhouettes-915fde48318f) | [Dan Fornace — 10 Tips](https://fornace.medium.com/dan-fornaces-10-tips-for-making-a-fighting-game-e2c982da2396) | [Game Developer interview](https://www.gamedeveloper.com/design/why-one-developer-says-fighting-game-devs-need-to-think-about-silhouettes)
- [Cal Kestis Poncho (Fallen Order Wiki)](https://starwarsjedifallenorder.fandom.com/wiki/Poncho) | [Jordan Lamarre-Wan ArtStation](https://jroid.artstation.com/projects/A91O9N)
- [Absolver Customization (PSLifestyle)](https://www.playstationlifestyle.net/2017/08/12/absolver-character-customization-showcased/) | [Absolver presskit (Steam)](https://store.steampowered.com/news/app/473690/view/3931035846867304454)
- [Beat Saber — Wikipedia](https://en.wikipedia.org/wiki/Beat_Saber) | [Custom Sabers Guide (BSMG)](https://bsmg.wiki/models/sabers-guide.html) | [Custom skins/colors (UploadVR)](https://www.uploadvr.com/how-to-use-custom-skins-and-colors-for-your-blades-in-beat-saber/)

### 라이트세이버 디자인 / 렌더링
- [Lightsaber Components (Ultrasabers)](https://ultrasabers.com/holocron/lightsaber-parts-understanding-the-basics/) | [Lightsaber Hilt (Wookieepedia)](https://starwars.fandom.com/wiki/Lightsaber_hilt/Legends) | [CubeDuel Hilt Anatomy](https://cubeduel.com/beneath-the-hilt-the-anatomy-of-lightsaber-handles-and-components/)
- [Jedi Survivor Lightsaber Styles (NSabers)](https://nsabers.com/blogs/lightsabers-guide/jedi-survivor-lightsaber-styles-from-crossguard-to-dual-wield-explained) | [Galactic Sabers Types](https://galacticsabers.co/different-types-of-lightsabers-explained) | [Double vs Dual (ArtSabers)](https://artsabers.com/blog/archive/is-double-sided-lightsaber-better-than-dual-wielding/) | [Lightsaber — Wikipedia](https://en.wikipedia.org/wiki/Lightsaber)
- [Kyber Crystal (Wookieepedia)](https://starwars.fandom.com/wiki/Kyber_crystal) | [Lightsaber Colors (TheorySabers)](https://www.theorysabers.com/pages/articles/colors) | [Color Meanings (CCSabers)](https://www.ccsabers.com/blogs/ccsabers-blog/lightsaber-color-meanings-complete-guide)
- [r3f-by-example: emissive bloom](https://onion2k.github.io/r3f-by-example/examples/effects/emissive-bloom/) | [r3f-by-example: emissive bloom 2](https://onion2k.github.io/r3f-by-example/examples/effects/emissive-bloom-postprocessing/) | [react-postprocessing Bloom docs](https://react-postprocessing.docs.pmnd.rs/effects/bloom)
- [Three.js Glow Shader (Stemkoski)](https://stemkoski.github.io/Three.js/Shader-Glow.html) | [WebGL Lightsaber (Lampert)](https://glampert.com/2015/06-07/webgl-lightsaber/) | [Lightsaber Glow Q&A (gamedev.net)](https://www.gamedev.net/forums/topic/364195-shader-lightsaber-glow-effect/364195/)
- [Three.js selective bloom example](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html) | [Selective Bloom Q&A (Three.js forum)](https://discourse.threejs.org/t/postprocessing-selective-bloom/61645) | [100 Three.js tips (Utsubo)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [drei Trail docs](https://drei.docs.pmnd.rs/abstractions/trail) | [drei useTrail](https://drei.docs.pmnd.rs/misc/trail-use-trail) | [pmndrs/meshline](https://github.com/pmndrs/meshline) | [pmndrs/drei](https://github.com/pmndrs/drei)
- [Building 60FPS WebGL on Mobile (Airtight)](https://www.airtightinteractive.com/2015/01/building-a-60fps-webgl-game-on-mobile/) | [Vader Immortal interactivity (VFX Voice)](https://vfxvoice.com/ramping-up-the-interactivity-for-vader-immortal-in-vr/)

### 커스터마이징 케이스 스터디
- [fly.pieter.com](https://fly.pieter.com/) | [VibeCoding.Wiki](https://www.vibecoding.wiki/showcase/fly-pieter-com-by-levelsio/) | [Vibecoded](https://www.vibecoded.co/p/fly-pieter-com)
- [Slither.io custom skins](https://slithere.com/create-custom-slither-io-skins/) | [Slither.io Wikipedia](https://en.wikipedia.org/wiki/Slither.io)
- [Krunker.io Skins Wiki](https://krunkerio.fandom.com/wiki/Skins) | [Krunker customization](https://krunker.io/guides/customization/)
- [BSMG Custom Avatars](https://bsmg.wiki/models/avatars-guide.html) | [BSMG Custom Sabers](https://bsmg.wiki/models/sabers-guide.html)
- [Roblox BodyColors API](https://create.roblox.com/docs/reference/engine/classes/BodyColors)
- [Nidhogg color thread](https://steamcommunity.com/app/94400/discussions/0/541906989415647185/)

### 에셋 파이프라인
- [Quaternius homepage (CC0)](https://quaternius.com/) | [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | [Modular Fantasy Outfits](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | [Universal Animation Library](https://quaternius.itch.io/universal-animation-library)
- [Mixamo Common Questions](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | [Mixamo licensing community](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775) | [Three.js Resources Mixamo](https://threejsresources.com/tool/mixamo)
- [Tripo3D pricing](https://www.tripo3d.ai/pricing) | [Tripo3D auto-rigging](https://www.tripo3d.ai/features/ai-auto-rigging) | [Tripo3D rig for Mixamo](https://www.tripo3d.ai/blog/rig-ai-generated-character-for-mixamo) | [Tripo3D credit guide](https://www.tripo3d.ai/blog/explore/3d-conversion-credits-guide)
- [Synty POLYGON Sci-Fi City](https://syntystore.com/products/polygon-sci-fi-city) | [Synty starter pack](https://syntystore.com/products/polygon-starter-pack)
- [Sketchfab — Star Wars low poly](https://sketchfab.com/3d-models/star-wars-low-poly-3d-characters-79e1578a33e44955ab3aaebb874994d0) | [Sketchfab — Cal Kestis](https://sketchfab.com/3d-models/low-poly-cal-kestis-b07d83a713ab45b188430548fd0b6618)
- [Don McCurdy — Mixamo + glTF](https://www.donmccurdy.com/2017/11/06/creating-animated-gltf-characters-with-mixamo-and-blender/) | [R3F character anim walkthrough](https://codeworkshop.dev/blog/2021-01-20-react-three-fiber-character-animation) | [R3F multi-anim discussion](https://github.com/pmndrs/react-three-fiber/discussions/1993) | [Three.js Mixamo GLB thread](https://discourse.threejs.org/t/i-need-help-importing-a-mixamo-model-glb-into-threejs-and-animating-it-without-it-breaking/46662)
- [Three.js DRACOLoader](https://threejs.org/docs/pages/DRACOLoader.html) | [Draco compression case](https://discourse.threejs.org/t/incredible-compression-on-a-glb/56996) | [ShaderMaterial uniform cloning](https://discourse.threejs.org/t/clone-a-shadermaterial-and-have-different-uniforms-for-different-copies-of-the-material/49713)
- [Colyseus Schema docs](https://docs.colyseus.io/state/schema) | [Colyseus State Sync](https://docs.colyseus.io/state) | [colyseus/schema GitHub](https://github.com/colyseus/schema)

### IP / 법적
- [Lightsaber IP Journey (Soundmark Law)](https://soundmarklaw.com/protecting-the-galaxys-most-iconic-weapon-the-lightsabers-ip-journey/) | [Laser Blade trope (TVTropes)](https://tvtropes.org/pmwiki/pmwiki.php/Main/LaserBlade) | [Legalities (Jedi Council Forums)](https://boards.theforce.net/threads/legalities-of-lightsabers-outside-star-wars.10332795/) | [Light saber IP (City of Titans)](https://cityoftitans.com/forum/can-we-legally-make-light-sabers)

### 프로젝트 내부 문서
- [`docs/duel-implementation.md`](../docs/duel-implementation.md) — 현재 빌드 상태
- [`docs/game-design.md`](../docs/game-design.md) — 컨셉 / 메카닉 / 잼 일정
- [`docs/tripo3d.md`](../docs/tripo3d.md) — Tripo3D 활용 가이드
- [`claudedocs/research_chambara_visuals_20260429.md`](./research_chambara_visuals_20260429.md) — 시각 처리 가이드 (Bloom, 트레일)
- [`claudedocs/research_impact_feedback_20260429.md`](./research_impact_feedback_20260429.md) — 타격감 가이드

---

**End of Character / Weapon / Customization Research Report**
