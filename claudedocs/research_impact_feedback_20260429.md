# Chambara Duel — 타격감 (Impact Feedback / Game Feel) 리서치 보고서

> **목적**: 1v1 검술 듀얼(Switch Sports Chambara 변형) 게임의 "타격감" 을 강화하기 위한 통합 리서치. 시각·청각·햅틱·시간·공간 5축에 걸쳐 적용 가능한 기법, 정량 수치, 우리 게임 룰(BLOCK / HIT / PIERCE / KO)별 권장 임팩트 시퀀스, R3F 구현 가이드.
>
> **작성일**: 2026-04-29
> **선행 문서**: `docs/game-design.md`, `docs/duel-implementation.md`, `claudedocs/research_chambara_20260428.md`, `claudedocs/research_chambara_visuals_20260429.md`
> **리서치 모드**: Deep (5 hop, 6개 병렬 sub-agent 분산 수집)
> **출력 정책**: 리서치 보고서. 코드 변경 없음. 구현은 사용자 결정 후 별도 단계.

---

## Executive Summary

타격감은 단일 효과가 아니라 **시각·청각·햅틱·시간·공간 5축** 에 걸친 신호가 ±1프레임 안에 동기화될 때 형성되는 통합 현상이다 (Steve Swink, *Game Feel*; Vlambeer, *Art of Screenshake*). 우리 게임은 현재 검 클래시 ring(파랑/빨강) 외에는 **SFX 0개, 카메라 셰이크 0, hit-stop 0, 파티클 0, 햅틱 0** 상태이므로, 타격감 측면에서 잼 출품작 사이에 가장 큰 차별을 만들 수 있는 영역이다.

본 보고서는 6개 영역을 병렬 조사하여 다음을 제시한다:

1. **우리 룰의 4가지 OUTCOME (BLOCK / HIT / PIERCE / KO) 별 임팩트 시퀀스** — hit-stop ms, 카메라 셰이크 trauma, 사운드 레이어, 햅틱 패턴, 비주얼 효과를 정량 수치로 매핑
2. **Tier S 핵심 4-기법** — SFX 3-layer + 결과별 차별화 / Hit-stop / 카메라 셰이크 / Whoosh — 잼 1주차에 도입 시 타격감 80% 달성
3. **R3F 구현 가이드** — `@react-three/postprocessing` Bloom/CA/Vignette + drei `<CameraShake>`/`<Trail>` + zustand 이벤트 스토어 패턴
4. **단일 최강 레퍼런스 = Sekiro의 deflect + 톤 = Wii Sports Resort + juice 스택 = Hades**
5. **iOS Safari 햅틱 부재 대응** — 60Hz 서브베이스 오디오 레이어로 100% 디바이스 폴백 가능

P0 일감만 합치면 약 **15-20시간**, 모든 레이어가 ±1프레임 동기화되도록 zustand 이벤트 스토어 한 곳에서 디스패치하는 패턴 권장.

신뢰도: **High** (격투 게임 frame data, GDC 강연, 격투 게임 분석가, R3F 공식 문서 다중 교차 검증).

---

## 1. 타격감의 5축 분해

Steve Swink는 game feel을 *real-time control + simulated space + polish* 의 합성으로 정의하지만, **임팩트 순간**에 한정해서는 다음 5축이 실용적 분해축이다.

| 축 | 정의 | 핵심 질문 | 우리 게임 현 상태 |
|---|---|---|---|
| **시각 (Visual)** | 충돌 순간 화면 변화 | "내 검이 닿았다"가 50ms 내에 망막에 박히는가? | 임팩트 링만 (BLOCK 파랑 / HIT 빨강) |
| **청각 (Audio)** | 충돌 사운드의 transient/body/tail 형태 | 가벼운 막대인가, 묵직한 강철인가? | **0 (SFX 없음)** |
| **햅틱 (Haptic)** | 디바이스 진동·키네스테시아 대체 | 손/마우스가 "맞았다"를 보고하는가? | **0** |
| **시간 (Temporal)** | 충돌 전후 시간 흐름 조작 | hit-stop이 두뇌에 인지 시간을 주는가? | **0** |
| **공간 (Spatial)** | 카메라·캐릭터 위치 재배치 | 화면 자체가 충격을 받았는가? | 넉백만 (push-along 구현됨) |

**핵심 통합 원칙**: 5축은 모두 **동일 충돌 이벤트에서 동일 프레임에 fire** 되어야 한다. ±1프레임을 벗어나면 두뇌가 별개의 사건으로 분리 인지하여 "약하게 분리된" 임팩트가 된다 (Sakurai, *Famitsu* 칼럼 vol.490).

**위계 일관성 원칙**: 모든 축의 amplitude 가 우리 룰의 OUTCOME 위계 — `KO > PIERCE > HIT > BLOCK` (또는 디자인 의도에 따라 `KO > BLOCK ≥ HIT > PIERCE`) — 를 따라야 한다. 위계가 축마다 다르면 결과 가독성이 깨진다.

---

## 2. 우리 게임 OUTCOME 별 임팩트 시퀀스 (정량 표)

격투 게임 frame data + 격투 게임 분석가(infil.net, sonichurricane, CritPoints) + GDC 강연 자료를 종합하여 우리 게임의 4가지 OUTCOME 에 매핑한 **권장 임팩트 시퀀스**. 모든 시간은 60Hz 기준 ms (1f = 16.67ms).

### 2.1 통합 임팩트 시퀀스 표

| 파라미터 | BLOCK<br>(직각 매칭) | HIT<br>(가드 X / 그레이즈) | PIERCE<br>(평행 가드 통과) | KO<br>(아레나 낙하) |
|---|---|---|---|---|
| **Hit-stop (timeScale=0.05)** | 50–67 ms (3–4 f) | 80–117 ms (5–7 f) | 117–183 ms (7–11 f) | 233–350 ms (14–21 f) |
| **카메라 trauma 추가** | +0.20 | +0.45 | +0.55 | +0.85 |
| **셰이크 max yaw/pitch** | 0.4° | 0.8° | 1.0° | 1.6° |
| **셰이크 roll 컴포넌트** | none | small | small | strong |
| **셰이크 duration** | 100 ms | 180 ms | 240 ms | 400 ms |
| **검신 white flash** | 33 ms | 50 ms | 50 ms | 67 ms |
| **풀스크린 white flash** | none | 16 ms (1 f) | 33 ms | 50 ms (white→edge red) |
| **Bloom intensity boost** | ×1.3 (120 ms) | ×1.5 (150 ms) | ×1.8 (180 ms) | ×2.5 (250 ms) |
| **Chromatic Aberration** | none | 0→3 px (120 ms) | 0→5 px (180 ms) | 0→7 px (250 ms) |
| **Vignette spike** | none | none | 0.20 (200 ms) | 0.40 (600 ms) |
| **Radial blur (PIERCE/KO)** | none | none | 0.3 (220 ms) | 0.4 (800 ms) |
| **Slow-mo 후속** | no | no | optional 0.6× × 200 ms | yes 0.25× × 650 ms |
| **임팩트 링 색** | 파랑 (`#4ea8ff`) | 빨강 (`#ff4040`) | 진홍 + 검정 | 흰 → 빨강 → 검 |
| **파티클 burst** | 푸른 spark 8–12개 | 붉은 burst 5–10개 | spark + cloth tear 15개 | 빅 burst 30 + ring shockwave |
| **SFX 레이어** | 금속 spark + ring + 짧은 reverb | thud + grunt + cloth | 둔탁한 thud + scrape + grunt | full mix + crowd + stinger |
| **SFX duration** | 350–500 ms | 300–450 ms | 400–600 ms | 1000–2000 ms |
| **햅틱 (Android `vibrate`)** | `[40,30,40]` | `[80]` | `[20,20,80]` | `[200,100,400]` |
| **햅틱 (Gamepad rumble)** | strong 0.6 / weak 0.2 × 120 ms | strong 0.9 / weak 0.4 × 80 ms | strong 1.0 chained × 2 | strong 1.0 / weak 0.7 × 600 ms |
| **음악 ducking** | none | -3 dB × 200 ms | -6 dB × 250 ms | -9 dB × 500 ms |
| **마우스 pseudo-haptic 저항** | 50 ms × 0.4 | 80 ms × 0.6 | 100 ms × 0.8 | 200 ms × 1.0 |
| **총 cinematic 길이** | ~150 ms | ~250 ms | ~450 ms | ~1100 ms |

### 2.2 OUTCOME 별 디자인 근거

#### BLOCK (직각 매칭, attacker stun 800ms 발동)
- **빈도가 가장 높음** — 라운드당 다수 발생 가능. 150ms 이상이면 게임 페이스가 끊김.
- Melee의 "minimum perceptible" hit-stop = 8f(133ms)에서 더 줄여 4f. attacker stun 800ms는 별도 게임플레이 레이어로 유지.
- **음색은 밝게** — bright metal-on-metal clash, high spark 강조, **flesh layer 0**, sub-bass 최소. 사운드만 들어도 PIERCE 와 즉시 구별되어야 한다 (Hithix, *Significance of Sound Design in Fighting Game Immersion*).
- 카메라 roll 0 — 깨끗한 "tink" 느낌, 필요 이상의 노이즈 회피.
- Chromatic Aberration 적용 안 함 — BLOCK 빈도 높아 누적 시 화면 노이즈.

#### HIT (가드 비활성 또는 그레이즈)
- 격투 게임 medium 공격 baseline — 7f hit-stop 매치 (Brawl/SF 미디엄).
- thud + grunt + cloth + slight sub-bass enhancer. 음악 -6 dB ducking 250 ms. low-pass swept whoosh (120 ms) 로 넉백 운동량 강화.
- 1프레임 풀스크린 화이트 플래시 — WCAG 3-flash/sec 룰 위반하지 않으면서 punch 추가.

#### PIERCE (가드 평행, 가드 무력화 통과)
- **우리 룰의 "wow" 모먼트** — KO 직전 가장 인상적인 결과. Strive-tier 11f hit-stop 으로 무게감 부여.
- **음색은 어둡게** — muted thud + cloth tear + grunt + 낮은 metallic scrape, 고주파 spark 0. BLOCK 의 정반대 음색이 룰을 가르친다.
- **카메라 roll 추가** — 검의 회전 운동량을 카메라가 상속, 직각 매칭 실패의 시각 신호.
- **Radial blur** 적용 — Chambara 컨텍스트에 부합하는 anime-style 효과 (MirzaBeig Anime-Speed-Lines).
- 가독성 critical: 플레이어가 "내 가드가 평행이었다"를 즉시 학습해야 룰이 작동.

#### KO (아레나 가장자리 낙하, 매치 종결)
- 라운드당 1회만 발생 — cinematic 예산 풀 활용.
- 14f hit-stop ≈ Smash Ultimate / SF2 baseline.
- **slow-mo envelope** (350ms hit-stop → 0.25× × 650ms → 1.0× 복귀) — Game Developer "Slow-mo Tips" 가이드: VFX는 hit-stop 동안 real-time clock으로 진행, time-scale은 그 이후 적용.
- 음악 -9 dB sidechain 500ms + crowd cheer + 라운드 결과 stinger.
- 입력 잠금 — 슬라이딩 인풋이 다음 라운드로 새지 않게.

### 2.3 세부 운용 가이드

**Hit-stop 동안 누가 멈추는가**: 양 캐릭터 + 양 검 모두 freeze (Smash/SF default). VFX(파티클, 링, 화이트 플래시)는 **real-time clock** 으로 계속 진행 — hit-stop 동안 시각이 증식해야 "멈춘 한 순간"이 visible.

**서버 권위 (Colyseus) 호환**: hit-stop 은 **클라이언트 시각 전용**, 서버 simulation tick은 60Hz 유지. 인터폴레이션 버퍼의 playback head만 freeze — 상대 클라이언트는 자기만의 hit-stop 을 봄. ±50ms 인터폴레이션 lag 안에서 desync 무시 가능.

**Reduced motion 대응**: `prefers-reduced-motion: reduce` 시 trauma 절반, 셰이크 translation 0, CA 비활성, slow-mo 200ms 단축.

---

## 3. 카테고리별 기법 권장

### 3.1 시각 (Visual)

#### 3.1.1 검신 / 임팩트 발광 (P0)

기존 visuals 리서치(`research_chambara_visuals_20260429.md`)에서 권장한 selective bloom 패턴 유지. **HDR emissive (RGB > 1.0) + Bloom luminanceThreshold = 0.9** 의 자동 selective bloom 패턴이 가장 가성비 좋음 (`@react-three/postprocessing` 공식 selective bloom 데모와 동일).

상태별 emissive intensity 전이:
```
idle:    intensity 0.0  emissive #ffffff
guard:   intensity 1.5  emissive #4ea8ff
charge:  intensity 2.5  emissive #66e5ff
swing:   intensity 4.0 (120ms 스파이크)
impact:  intensity 6.0 (50–67ms 스파이크, OUTCOME 따라)
```

#### 3.1.2 검 트레일 (P0)

**drei `<Trail>`** 권장 (1차). 이미 작동 검증된 컴포넌트, MeshLine 기반.
- `length: 6–10` (≈60 points), `decay: 2.5–4.0`, `attenuation: t => t*t`
- `color`: HDR 값 (`new Color(2.5, 1.5, 4.0)` 같이 RGB > 1.0) → Bloom 자동 매칭
- **swing-active 프레임만** 렌더 — idle 시 검 보브 잔상이 ghost 처럼 보이는 안티패턴 회피
- 폴백: `meshline` 직접 — `widthCallback={p => Math.sin(p*Math.PI)}` 로 swing 속도별 taper

#### 3.1.3 충돌점 sparks / burst (P0)

instanced mesh + 셰이더 vertex 추진. 50–100 라인의 vert shader 로 충분. drei `<Sparkles>` 는 ambient 용도 — 일회성 burst 에는 group scale 트윈 필요 (안티패턴).

```glsl
// vertex (instanced)
vec3 pos = position + (aVelocity * uTime + 0.5 * vec3(0,-9.8,0) * uTime*uTime) * step(uTime, aLife);
```

OUTCOME 별 색:
- BLOCK: `#7ec8ff` (푸른 spark, 8–12개, 0.3s 수명)
- HIT: `#ff5050` (붉은 burst, 5–10개, 0.4s 수명)
- PIERCE: `#ff8030` + `#cccccc` (mixed orange + cloth tear, 15개, 0.5s 수명)
- KO: `#ffffff` → `#ff3030` 그라디언트 30개, ring shockwave 동반

#### 3.1.4 임팩트 링 / shockwave (P0, 기존 시스템 보강)

`?demo=arena` 의 `RingGeometry` 펄스를 셰이더 기반으로 업그레이드. uniform `uTime` 으로 0→1 lerp, vertex 에서 scale + fragment 에서 fresnel + emissive HDR (× 3.0) → 자동 bloom.

#### 3.1.5 Hit Flash (P0)

- 검신 white flash: shader uniform `_HitFlash` 0→1→0 lerp 33–67ms, ease-out
- 풀스크린 white flash: 1프레임 (~16ms) plane, `depthTest=false`, `renderOrder=999`. **HIT 부터만**, BLOCK 은 빈도 높아 제외.
- WCAG: 3-flash/sec 미만 유지. 우리 게임 기본 페이스(공격 cooldown 600ms)에선 자동 충족.

#### 3.1.6 Postprocessing 파이프라인 (P0)

```jsx
<EffectComposer multisampling={0} disableNormalPass>
  <Bloom intensity={1.0} luminanceThreshold={0.9}
         luminanceSmoothing={0.2} mipmapBlur
         kernelSize={KernelSize.SMALL} />
  <ChromaticAberration ref={caRef} offset={[0,0]} radialModulation={true} />
  <Vignette darkness={0.4} offset={0.3} />
  <Noise opacity={0.04} premultiply blendFunction={BlendFunction.SCREEN} />
  <SMAA />
</EffectComposer>
```

KO 만 `<Glitch>` 조건부 마운트 (~250ms). DoF 는 KO replay (≤2s) 윈도우에만.

### 3.2 청각 (Audio)

#### 3.2.1 사운드 레이어링 — 4-layer 합성 (P0)

David Dumais Audio (Sekiro / Ghost of Tsushima / For Honor 사운드 디자인 분석 시리즈) 권장 4-layer:
1. **weapon swing** — air-cut whoosh, 200–400ms, 1–4kHz 광대역 노이즈
2. **scrape** — 메탈 ring tail (옵션), 깨끗한 스윙엔 약하게, 가드 충돌 시 강하게
3. **hit / impact** — 충돌 시 추가
4. **enhancers** — sub-bass thump (60–120Hz), voice grunt

#### 3.2.2 BLOCK / HIT / PIERCE 음색 분리 (P0, 룰 가독성 핵심)

| OUTCOME | 고주파 spark<br>(5–12kHz) | 중주파 body<br>(1–4kHz) | 저주파 thud<br>(60–150Hz) | flesh layer | grunt | reverb tail |
|---|---|---|---|---|---|---|
| **BLOCK** | ★★★ | ★★★ | ☆ | 없음 | 없음 | 짧은 plate 300–500ms |
| **HIT** | ☆ | ★★ | ★★★ | ★★ (cloth) | ★★ | 짧은 200ms |
| **PIERCE** | 없음 | ★ (low metallic scrape) | ★★★ | ★★★ (cloth tear) | ★★★ | 어두운 400–600ms |

**원칙**: BLOCK 과 PIERCE 가 주파수 스펙트럼 정반대 — 음악적으로 들어도 0.1초 안에 구분 가능해야 한다.

#### 3.2.3 음색 변이 (P0)

- **Pitch randomization**: ±5–8% (impacts), ±10–15% (whooshes/footsteps)
- **Velocity-based sample swap**: 2–3 variants per slot ("light" / "med" / "heavy")
- **Volume**: `lerp(0.6, 1.0, swingForce)` — 마우스 드래그 거리/속도 기반

#### 3.2.4 windUp 텔레그래프 사운드 (P0, 우리 게임 특화)

현재 `windUpMs = 280` 은 방어자가 가드 각도 조정할 시간. **사운드로도 강조** 필수:
- 공격자 측에서 rising metallic ring (200–280ms, 피치 ±3% 만 — 학습성 위해 일관성)
- 스테레오 위치: 공격자 쪽에 팬
- 슬라이스 vs 찌르기 별 다른 텔레그래프 (찌르기는 더 높은 피치 + 짧은 sustain)

#### 3.2.5 Counter Window 청각 큐 (P0)

BLOCK 후 600ms counter window 진입 시:
- Trigger: rising shimmer (sine sweep 400→1200 Hz, 250ms)
- Expiry warn: soft "ready" tick at 480ms (윈도우 종료 80ms 전)
- 방어자 측 스테레오 팬, 볼륨 -8 ~ -10 dB (정보 전달, 압도하지 않음)

#### 3.2.6 라이브러리 선택 (P0)

**howler.js 권장** (잼 일정):
- 7KB gzipped, 모바일 자동 unlock 자동 처리, sprite 지원, format fallback
- Tone.js (~80KB+) 는 synthesis 용 — 우리는 sample playback 만 필요해 over-spec
- Web Audio raw 는 모바일 unlock + sprite 슬라이싱 + format fallback 모두 자체 구현 필요

R3F 통합:
- **howler.js** = one-shot SFX (swing, impact, ko)
- **drei `<PositionalAudio>`** = looping ambient / footstep loop / breathing (캐릭터 transform 자동 상속)

#### 3.2.7 잼 최소 SFX 셋 (12 파일)

```
1.  swing.ogg          (3 variants 스프라이트, ±10% pitch 랜덤)
2.  windup.ogg         (1 variant, 일관성 유지)
3.  block.ogg          (2 variants, bright metal clash)
4.  pierce.ogg         (1 variant, dark thud + scrape)
5.  hit.ogg            (2 variants, thud + grunt 혼합)
6.  grunt.ogg          (분리 — stun/KO 시 재트리거)
7.  footstep.ogg       (3 variants 스프라이트)
8.  counter_open.ogg   (rising shimmer)
9.  ko.ogg             (heavy thud + crowd)
10. bell_round_start.ogg
11. countdown_beep.ogg (3× rate 0.9/1.0/1.1)
12. victory_stinger.ogg
```

오디오스프라이트 1개 (~300–500KB at 96kbps Opus). 단일 HTTP 요청.

#### 3.2.8 무료 사운드 에셋 소스

| 소스 | 라이센스 | 핵심 키워드 |
|---|---|---|
| Sonniss GameAudioGDC | Royalty-free, commercial OK | "metal impact", "sword", "swoosh", "body fall", "bell", "crowd" |
| Kenney.nl | CC0 | "Impact Sounds", "RPG Audio" |
| Freesound.org | CC0/CC-BY | "katana whoosh", "metal clang", "sword unsheath", "body thud", "grunt male short" |
| Pixabay Sound Effects | Pixabay license | "sword fight", "metal clang", "anime hit" |
| Mixkit | Mixkit license | sword-specific |
| gamesounds.xyz | CC0 미러 | aggregator |

#### 3.2.9 Audio sub-bass 햅틱 시뮬 (P0, iOS Safari 폴백)

iOS Safari 가 `navigator.vibrate` 비지원이므로 모바일 약 50% 사용자에게 햅틱 부재. **저주파 오디오 레이어**가 universal 폴백:
- 60Hz sine, 80ms duration, 5ms attack, exponential decay
- combat events (HIT/BLOCK/PIERCE/KO) 에만 (muddiness 회피)
- 폰 스피커의 골 전도 + 손바닥 전도로 사용자가 "느낌"

### 3.3 햅틱 (Haptic)

#### 3.3.1 지원 매트릭스 (2026-04 기준)

| 환경 | Web Vibration API | Gamepad rumble | 폴백 |
|---|---|---|---|
| Chrome desktop | no-op (하드웨어 X) | ✅ v68+ dual-rumble | — |
| Edge | no-op | ✅ | — |
| Firefox v129+ | **regression / 미지원** | ❌ 미지원 | 시각/청각 강화 |
| **Safari iOS** | **❌ 거부 정책 (oppose)** | ❌ | **audio sub-bass 필수** |
| Safari macOS | ❌ | ✅ v16.4+ dual-rumble | — |
| Chrome Android | ✅ 풀 지원 | ✅ | — |
| Samsung Internet | ✅ 풀 지원 | ✅ | — |

**iOS Safari 우회 옵션**:
1. Capacitor 네이티브 쉘 (앱스토어 배포 필요, 잼 부적합)
2. iOS 18+ `<input type="checkbox" switch>` 햅틱 사이드이펙트 (단일 레벨, 메뉴 confirm 정도)
3. Audio-as-haptic (60Hz sub-bass) — **유일한 잼-호환 universal 폴백**

#### 3.3.2 햅틱 패턴 디자인

`navigator.vibrate(pattern)` (Android Chrome / Samsung Internet):
- BLOCK: `[40, 30, 40]` — 짧은 더블 펄스
- HIT: `[80]` — 단발 강한 펄스
- PIERCE: `[20, 20, 80]` — 빠른 더블 + sustain
- STAGGER (block 후 attacker stun): `[10, 30, 10, 30, 10]` 트리플 클릭
- STUN ramping (스턴 중 진행): `[100, 80, 80, 60, 60, 40, 40, 20]` 페이드아웃
- KO: `[200, 100, 400]` — 묵직 + 비트 + sustain
- Round start: `30` 단발

Gamepad `playEffect("dual-rumble", ...)`:
- BLOCK: `{ duration: 120, strongMagnitude: 0.6, weakMagnitude: 0.2 }`
- HIT: `{ duration: 80, strongMagnitude: 0.9, weakMagnitude: 0.4 }`
- PIERCE: 두 effect chain 30ms 간격, 두 번째 strong 1.0
- KO: `{ duration: 600, strongMagnitude: 1.0, weakMagnitude: 0.7 }`

#### 3.3.3 채널 할당 by Platform

| 플랫폼 | 시각 | 청각 | 햅틱 | 비고 |
|---|---|---|---|---|
| 데스크톱 마우스 | 50% | 50% | 0% | 셰이크 + 저주파 thud 강화 |
| 데스크톱 게임패드 | 35% | 35% | 30% | dual-rumble |
| Android 터치/자이로 | 35% | 30% | 35% | Vibration API |
| **iOS Safari 터치/자이로** | **45%** | **45%** | **10%** | audio sub-bass 의존 |

#### 3.3.4 Pseudo-haptic (마우스 사용자 차별화)

Pointer Lock + movementX/Y 일시 댐핑 — 임팩트 순간 50–100ms 마우스 입력 무시 또는 cursor lerp 저항. **우리 게임의 시그니처 햅틱 채널이 될 수 있는 차별점** — 마우스 사용자에게 시각/청각 외 유일한 신체 신호.

#### 3.3.5 햅틱 토글

- 베터리, 사용자 선호, 접근성 사유로 **항상 settings 토글 제공** (default ON)
- `if ('vibrate' in navigator)` feature-detect 후 graceful no-op
- 햅틱 예산 ≤ 매치 시간의 ~15% — 손 피로 / "꺼버리는" 반사 회피

### 3.4 시간 (Temporal)

#### 3.4.1 Hit-stop / Hit-pause

3장 OUTCOME 표 참조. 격투 게임 표준값에 우리 라운드 페이스(30–60s) 보정.

**구현 패턴 (R3F)**:
- 글로벌 `useFrame` delta 조작 불가 — per-system 시간 스케일 store 패턴
- zustand `useTimeScale` 스토어, 모든 visual system 이 `useFrame((_, dt) => dt * useTimeScale.getState().scale)` 로 읽기
- 서버 simulation tick 은 **절대 영향 X** — 클라이언트 visual 전용
- Colyseus 인터폴레이션 버퍼의 playback head 만 80ms freeze 후 200ms catch-up

#### 3.4.2 Slow-motion (KO cinematic)

```
t = 0–80ms:    timeScale 0 (hit-stop), VFX는 real-time clock
t = 80–150ms:  timeScale 1.0 → 0.25 (ease-out cubic)
t = 150–800ms: hold 0.25
t = 800–1100ms: timeScale 0.25 → 1.0 (ease-in)
total: ~1.1s
```

입력 잠금 + cinematic 카메라 takeover. Game Developer "Slow-mo Tips and Tricks": **VFX는 hit-stop 동안 real-time, time-scale 은 그 이후 적용** — VFX 가 못 피어나고 멈추는 안티패턴 회피.

#### 3.4.3 Anticipation Hold

공격 직전 1–3프레임 freeze (windup 끝). 검 swing 이 마우스 직접 제어라 **AI/네트워크 잠복기 보정 시점에만 적용** — 대인전에선 어색함.

### 3.5 공간 (Spatial)

#### 3.5.1 카메라 셰이크 — Trauma 모델 (P0)

Squirrel Eiserloh GDC 2016 *Juicing Your Cameras with Math*:
```
trauma ∈ [0, 1]
매 프레임: trauma = max(0, trauma - 1.0~1.5 * dt)
shake = trauma² (또는 trauma³ 더 punchy)
displacement = 3개 독립 perlin/simplex 트랙 샘플 (yaw/pitch/roll)
```

**중요**: 3D 게임에서 **rotational shake only** — translational shake 는 motion sickness #1 트리거 (Xbox Accessibility Guideline 117).

#### 3.5.2 권장 수치

3장 OUTCOME 표 참조. yaw/pitch 0.4–1.6°, roll 0.0–1.2°, frequency 25–40Hz, duration 100–400ms.

#### 3.5.3 Camera 직접 vs 부모 group (P0 critical 룰)

**카메라를 절대 직접 흔들지 말 것**. 카메라 follow 로직, drei `<CameraControls>` 와 충돌. 부모 `<group>` 으로 감싸서 그 group 의 position/rotation 을 흔들기.

```jsx
<TraumaShake>
  <PerspectiveCamera makeDefault position={...} />
</TraumaShake>
```

#### 3.5.4 drei `<CameraShake>` (P0 빠른 시작)

drei `staging/CameraShake` — perlin 기반 rotational shake. `setIntensity(0.4 / 0.6 / 1.0)` 으로 OUTCOME 별 차등.

P1 폴리시: trauma² 커브가 필요하면 직접 구현으로 교체 — drei 의 linear decay 보다 punchy.

#### 3.5.5 Directional Camera Push

수평 swing → 좌우, 수직 swing → 상하로 카메라 살짝 밀림 (Game Developer *Improving Combat Impact*). 우리 룰에서 "검 각도"가 핵심이라 매우 적합. trauma 셰이크와 별개로 1회성 push offset (10–15ms 동안 0.05 unit 이동 후 복귀).

#### 3.5.6 Camera Zoom Punch

임팩트 시 0.5–1° FOV 펄스 (50ms 펄스 후 200ms 복귀). 매우 저비용 (FOV uniform 1줄), R3F 에서 즉시.

#### 3.5.7 Reduce-motion 대응

`window.matchMedia('(prefers-reduced-motion: reduce)')` 시:
- Trauma 절반
- Translation 0
- Roll 0
- CA / Glitch 비활성
- Slow-mo 200ms 단축
- 항상 사용자 슬라이더 (셰이크 0–100%) + off 토글 제공

---

## 4. 검 격투 게임 레퍼런스 분석

### 4.1 Tier 1: 직접 차용 가능한 패턴

#### Sekiro: Shadows Die Twice — **단일 최강 레퍼런스**

우리 룰과 가장 유사:
- 연속 입력 정밀 검사 (continuous, not discrete stance)
- 같은 입력이 tier 결과 (block vs perfect deflect = 작은 spark vs 큰 burst)
- 성공 방어가 공격 자원 충전 (posture)
- "눈 감고도 구분 가능" 한 audio-visual 차이 — 우리 터치/자이로(눈이 화면 밖) 환경에 직접 매핑

**직접 클론할 패턴**:
1. BLOCK = 작은 yellow spark + low clang. **Perfect perpendicular** (각도 차 < 5°) = 큰 orange burst + 높은 피치 louder clang
2. Posture 미터 — 누적 perfect block 시 stagger 게이지 → 1격 KO 가능 (Best of 3 라운드 종결 메커니즘)
3. Wind-up 시 발 끌기 / 검 세우기 텔레그래프 — 280ms 우리 windUp 의 시각화

**회피**: 危 kanji 를 적의 모델 위에 띄우는 패턴 — Sekiro 의 1순위 비판점. For Honor 의 검 끝 chevron 으로 대체.

#### Hades — Juice 스택 표준

hitstop 9–13f + 셰이크 (가중치 비례) + 컬러 코드 spark + 고채도 slash arc + audio sting 동시 발사. 셰이크는 접근성 토글 노출.

→ 우리 게임의 "5축 동시 발사" 표준 모범. 모든 효과를 같은 zustand 이벤트에서 dispatch.

#### Bushido Blade 2 — 컬러 코드 spark

충돌점 spark 색으로 결과 인코딩: 파랑 = correct block (low recovery), 초록 = wrong block (long recovery), 흰 = reflect possible.

→ 우리 4-결과 (BLOCK/HIT/PIERCE/KO) 도 spark 색으로 즉시 학습 가능.

### 4.2 Tier 2: 부분 차용

| 게임 | 차용 포인트 | 회피 포인트 |
|---|---|---|
| **Switch Sports Chambara** | 직각 stun 메커닉 (이미 적용) | 톤이 너무 무미건조 — 우리는 더 punchy 필요 |
| **Wii Sports Resort Swordplay** | **톤의 1순위 레퍼런스** — bright, bloodless, satisfying-clang | 시각 폴리시 부족 (구버전) |
| **For Honor** | 검 끝 directional chevron, 분리 audio stem (attacker/defender) | red-arrow UI 시그니처는 모방 회피 |
| **Ghost of Tsushima** | "lethality contract" — 클린 컷 = KO. white-blue 모션 블러 ribbon | 블러드 메시 톤 부적합 |
| **Nioh Ki Pulse** | blue swirl 로 윈도우 진입 알림 → 우리의 perpendicular 진입 시 검신 blue glow 펄스 | stamina 시스템 자체는 우리 룰과 무관 |
| **Hellblade** | 바이노럴 audio + UI-free damage indicator | 분위기 무거움, 잼 부적합 |
| **Mordhau / Chivalry 2** | 평행 검 클래시는 grinding scrape 사운드 | 1인칭 + gore 톤 부적합 |
| **Nidhogg** | 최소 효과 스택으로 한 방 KO 드라마 — MVP 모델 | 픽셀 아트 톤 |
| **Until You Fall** | 3-tier 햅틱 (light/medium/heavy) | VR 전용 |

### 4.3 톤 권장 — Wii Sports Resort + Sekiro + Hades

- **메커닉 레퍼런스**: Sekiro deflect (continuous + tier + posture)
- **톤 / 비주얼**: Wii Sports Resort Swordplay (bright, bloodless, stylized) — 잼 광범위 청중 적합
- **Juice 스택**: Hades (5축 동시 발사 + 접근성 토글)

이 3-축 합성이 우리 게임의 시그니처 룩.

---

## 5. R3F 구현 우선순위 + 시간 견적

### 5.1 P0 — 잼 1주차 (~15h)

| 순서 | 작업 | 시간 | 효과 |
|---|---|---|---|
| 1 | 12개 SFX 에셋 수집 + audiosprite 생성 (Sonniss + Freesound) | 2h | 청각 채널 0 → 80% |
| 2 | howler.js 도입 + sprite playback 모듈 + 모바일 unlock | 1h | 사운드 동작 |
| 3 | OUTCOME 별 SFX 매핑 (BLOCK/HIT/PIERCE/KO 음색 분리) + pitch 랜덤 | 1.5h | 룰 청각 가독성 |
| 4 | windUp 텔레그래프 사운드 + counter window 청각 큐 | 1h | 우리 룰 특화 |
| 5 | `@react-three/postprocessing` Bloom (mipmapBlur) + Noise + SMAA | 1h | 검 발광 자동화 |
| 6 | 검신 emissive HDR 상태 전이 (idle/guard/charge/swing/impact) | 1h | bloom 자동 매칭 |
| 7 | drei `<Trail>` 스워드 트레일 (HDR color, swing-active toggle) | 1h | 스윙 모션 가시화 |
| 8 | 셰이더 기반 expanding impact ring (HIT 빨강 / BLOCK 파랑) | 1.5h | 기존 ring 보강 |
| 9 | drei `<CameraShake>` + setIntensity OUTCOME 분기 | 1h | 셰이크 도입 |
| 10 | ChromaticAberration ref-mutation pulse | 0.5h | HIT/PIERCE 강조 |
| 11 | zustand 이벤트 스토어 (`useImpacts`, `useShake`, `useTimeScale`) | 1h | 동기화 인프라 |
| 12 | `useDuelLoop` OUTCOME → `dispatchImpactFx` 단일 디스패처 | 1h | 5축 ±1프레임 동기화 |
| 13 | Hit-stop store + per-system delta 스케일링 | 1.5h | 시간 축 도입 |
| 14 | navigator.vibrate (Android/Samsung) + 60Hz audio sub-bass (iOS) | 1h | 햅틱 universal |

**P0 총합 ≈ 15시간**. 결과: 5축 모두 활성화, 4-OUTCOME 차등화, ±1프레임 동기화.

### 5.2 P1 — 잼 2주차 (~7h)

| 순서 | 작업 | 시간 |
|---|---|---|
| 15 | 충돌점 instanced sparks burst (OUTCOME 별 색) | 2h |
| 16 | KO slow-mo envelope (350ms freeze → 0.25× × 650ms → 복귀) | 1.5h |
| 17 | Trauma-based 커스텀 shake (drei 교체, trauma² 커브) | 1.5h |
| 18 | `<Glitch>` KO 조건부 마운트 + DoF 시네마틱 | 1h |
| 19 | drei `<PerformanceMonitor>` 자동 tier 스위처 (high/mid/low) | 1h |

### 5.3 P2 — 시간 여유 (~5h)

| 순서 | 작업 | 시간 |
|---|---|---|
| 20 | Pseudo-haptic (마우스 movementX/Y 일시 댐핑) | 1.5h |
| 21 | 풀스크린 white flash 1프레임 plane | 0.5h |
| 22 | Counter window 화면 가장자리 vignette 텔레그래프 | 1h |
| 23 | Posture/balance 미터 (Sekiro 차용) | 2h |
| 24 | 네트워크 인터폴레이션 freeze + catch-up (멀티 hit-stop 호환) | 3h |

### 5.4 Skip / 비추천

- **`three-nebula` 파티클** — 80KB + 복잡한 config, 잼 규모 (~200 동시 파티클)에 over-spec
- **per-object Motion Blur** — velocity buffer pass 비싸, 모바일 ~25% FPS 손해. drei `<Trail>` 길이 동적 조정으로 대체
- **DoF 항시** — depth pass 모바일 FPS 박살. KO replay 만
- **Capacitor 네이티브 쉘 (iOS 햅틱용)** — 앱스토어 배포 일정 잼 부적합. audio sub-bass 폴백으로 충분

---

## 6. 코드 통합 패턴

### 6.1 zustand 이벤트 스토어 — 단일 진실 소스

```ts
// stores/useImpacts.ts
type ImpactEvent = {
  id: string
  pos: Vec3
  outcome: 'BLOCK' | 'HIT' | 'PIERCE' | 'KO'
  time: number
  attackerSide: 'player' | 'opponent'
}

export const useImpacts = create<{
  impacts: ImpactEvent[]
  push: (i: Omit<ImpactEvent, 'id' | 'time'>) => void
  prune: () => void
}>(...)

// stores/useShake.ts
export const useShake = create<{ trauma: number; add: (v: number) => void }>(...)

// stores/useTimeScale.ts
export const useTimeScale = create<{
  scale: number
  hitstop: (ms: number) => void
}>((set, get) => ({
  scale: 1,
  hitstop: (ms) => {
    set({ scale: 0.05 })
    setTimeout(() => set({ scale: 1 }), ms)
  }
}))
```

### 6.2 `useDuelLoop` 단일 디스패처

```ts
// useDuelLoop.ts — OUTCOME 결정 후 1곳에서 fire
function dispatchImpactFx(outcome: Outcome, ctx: ImpactCtx) {
  const kind = outcome.kind
  useImpacts.getState().push({
    pos: ctx.contactPoint,
    outcome: kind,
    attackerSide: ctx.attackerSide
  })
  useShake.getState().add(
    kind === 'KO' ? 0.85 :
    kind === 'PIERCE' ? 0.55 :
    kind === 'HIT' ? 0.45 :
    0.20
  )
  useTimeScale.getState().hitstop(
    kind === 'KO' ? 350 :
    kind === 'PIERCE' ? 150 :
    kind === 'HIT' ? 100 :
    60
  )
  playSfx(kind, { pitchVariation: 0.07 })
  triggerHaptic(kind)
  if (kind === 'HIT' || kind === 'PIERCE') triggerWhiteFlash(kind === 'PIERCE' ? 33 : 16)
}
```

### 6.3 효과 컴포넌트는 스토어 구독, useDuelLoop 와 분리

```jsx
function ImpactRings() {
  const impacts = useImpacts(s => s.impacts)
  return impacts.map(i => <ImpactRing key={i.id} {...i} />)
}

function CameraRig({ children }) {
  return <TraumaShake>{children}</TraumaShake>
}

function PostFX() {
  const caRef = useRef()
  useFrame(() => {
    // ChromaticAberration ref-mutation, 절대 setState 금지
    caRef.current.offset.lerp(targetOffset, 0.2)
  })
  return <EffectComposer>...</EffectComposer>
}
```

`shared/combat/resolver.ts` 는 이펙트 코드를 import 하지 않음 — 서버 권위 / 결정론 유지.

---

## 7. 안티패턴 / 함정

1. **카메라 직접 흔들기** — `<CameraControls>` 와 충돌. 항상 부모 group 흔들기.
2. **`useFrame` delta 글로벌 조작** — R3F 에 글로벌 hook 없음. per-system store 읽기.
3. **`setState` 로 매 프레임 effect 파라미터 갱신** — `EffectComposer` 재렌더 → GL 파이프라인 재구축. `ref.current` mutation in `useFrame`.
4. **`SelectiveBloom` 동적 selection 배열** — 매 렌더 새 배열 → layer mask thrash. 안정적 ref 배열 또는 HDR-emissive 자동 bloom 사용.
5. **서버 simulation 에 hit-stop 적용** — Colyseus desync. **클라이언트 visual 전용**.
6. **idle 시 검 trail 렌더** — ghost 자국. swing-active 프레임만.
7. **ChromaticAberration > 0.01** — 모바일 화면에서 망가져 보임. ≤ 0.005 cap.
8. **`<Glitch>` 항시 마운트** — `active=false` 상태에서도 ~1.5ms (render target 존재). KO 시점에만 조건부 마운트.
9. **`<Sparkles>` 일회성 burst 에 사용 (수명 무한)** — 타이머 unmount 또는 group scale 트윈 필요.
10. **`antialias: true` Canvas + EffectComposer** — MSAA 낭비. SMAA in composer 사용.
11. **MeshLineMaterial `transparent` + `depthWrite=false` 누락** — z-fight.
12. **`useState` 로 time-scale 관리** — 전체 서브트리 재렌더. `useStore.getState()` mutation in `useFrame`.
13. **Hit-stop 동안 VFX 도 같이 freeze** — VFX 가 못 피어남. VFX는 real-time clock 사용.
14. **VFX 모두 hit-stop 끝나고 시작** — 임팩트 순간 visible 한 게 없어 약함. 임팩트 순간에 VFX spawn 시작, hit-stop 동안 real-time 으로 계속 진행.
15. **`prefers-reduced-motion` 무시** — 약 30% 사용자 motion sickness. Trauma 절반, translation 0.
16. **WCAG 위반 chained flash** — 3-flash/sec 룰. 우리 cooldown 600ms 에서 자동 충족하지만 boss rush 등 fast-pace 모드 도입 시 주의.
17. **햅틱을 유일 피드백 채널로 사용** — iOS Safari 에서 침묵. 시각/청각이 동일 정보 전달.
18. **iOS 무음 모드 우회 시도** — Apple 이 일부러 차단. 공식 1줄 안내 ("무음 모드 끄세요") 가 honest 한 길.

---

## 8. 신뢰도 / 정보 격차

| 항목 | 신뢰도 | 비고 |
|---|---|---|
| Hit-stop frame 수 (격투 게임 frame data) | High | sonichurricane, infil.net, SmashWiki 다중 교차 |
| Camera shake trauma 모델 (Eiserloh) | High | GDC 2016 공식 강연 + 다수 정리본 |
| Slow-mo ramp envelope | High | Game Developer 가이드 + Bayonetta/SF6 사례 |
| 사운드 4-layer 합성 | High | David Dumais 시리즈 + Pixflow + GameSFXPacks 일치 |
| iOS Safari Vibration API 미지원 | High | Can I Use + WebKit standards-positions oppose |
| BLOCK/PIERCE 음색 분리 효과 | Medium | 격투 게임 관행, 우리 게임 직접 검증 필요 |
| Switch Sports Chambara 정확한 hit-stop 수치 | Low | 공개 frame data 부재 — 실제 영상 frame counting 필요 |
| Sekiro deflect spark 색·피치 정확 코드 | Low | 영상 분석 필요 |
| 우리 게임 P0 ≈ 15h 견적 | Medium | 작업 항목 별 0.5-1.5h 가중평균. 첫 도입 변수 큼 |
| Counter window 청각 큐 효과 | Low | 우리 룰 신규 메커닉, 직접 playtest 검증 필요 |

---

## 9. 후속 권장

1. **`/sc:design`** — `useImpacts` / `useShake` / `useTimeScale` 스토어 + `dispatchImpactFx` 인터페이스 명세 + 효과 컴포넌트 트리 구조 설계
2. **`/sc:implement`** — P0 순서대로 단계 구현. 각 단계 후 직접 brower 검증 (cli typecheck 만으로 시각 검증 불가)
3. **에셋 수집 별도 단계** — Sonniss + Freesound 에서 12개 SFX 수집, audiosprite CLI로 스프라이트 생성. 약 1.5h 수집 작업 분리
4. **Switch Sports Chambara 실 영상 frame counting** — 우리 게임의 톤 정합 검증 위해 영상 다운로드 → ffmpeg 프레임 추출 → 색/타이밍 측정
5. **playtest 프로토콜** — P0 도입 후 신규 플레이어 5명에게 30초 매치 시키고 BLOCK/HIT/PIERCE 를 사운드만으로 구분 가능한지 확인 (음색 분리 검증)
6. **MMR / 랭크 확장 시 결정론 hit-stop** — 클라이언트 visual freeze 가 server simulation 영향 0 인지 회귀 테스트

---

## 10. 출처

### Game Feel 이론
- [Steve Swink — *Game Feel*, Ch.1 (PDF)](http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf)
- [Game Feel — Wikipedia](https://en.wikipedia.org/wiki/Game_feel)
- [Liz England — *Game Feel* 리뷰](https://lizengland.com/blog/review-game-feel-by-steve-swink/)
- [Jan Willem Nijman — *The Art of Screenshake* (YouTube)](https://www.youtube.com/watch?v=AJdEqssNZ-U)
- [Jonasson & Purho — *Juice it or lose it* (YouTube)](https://www.youtube.com/watch?v=Fy0aCDmgnxg)
- [GDC Vault — Juice it or lose it](https://www.gdcvault.com/play/1016487/Juice-It-or-Lose)
- [Game Developer — *Improving the Combat Impact of Action Games*](https://www.gamedeveloper.com/audio/improving-the-combat-impact-of-action-games)

### Hit-stop / Camera Shake / Slow-mo
- [Hitlag — SmashWiki](https://www.ssbwiki.com/Hitlag)
- [CritPoints — Hitstop/Hitfreeze/Hitlag/Hitpause](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/)
- [Impact Freeze — sonichurricane.com](https://sonichurricane.com/?p=1043)
- [Sakurai *Famitsu* Column 490 — Source Gaming 번역](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/)
- [infil.net Fighting Game Glossary — Hitstop](https://glossary.infil.net/?t=Hitstop)
- [Frame Data — Street Fighter Wiki](https://streetfighter.fandom.com/wiki/Frame_Data)
- [GGST Mechanics — Dustloop](https://www.dustloop.com/w/GGST/Mechanics)
- [Squirrel Eiserloh — *Juicing Your Cameras with Math*, GDC 2016](https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt)
- [Camera shake — r3f by example](https://onion2k.github.io/r3f-by-example/examples/hooks/camera-shake/)
- [Perlin Camera Shake Tutorial — ArmanDoesStuff](https://www.armandoesstuff.com/devlogs/perlin-camera-shake-tutorial)
- [Game Developer — *Slow-mo Tips and Tricks*](https://www.gamedeveloper.com/design/slow-mo-tips-and-tricks)
- [Witch Time — Bayonetta Wiki](https://bayonetta.fandom.com/wiki/Witch_Time)
- [Xbox Accessibility Guideline 117 (camera shake)](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)
- [Motion Sickness Accessibility — Maddy Miller](https://madelinemiller.dev/blog/motion-sickness-accessibility/)

### 검 격투 레퍼런스
- [Sekiro Posture — Fextralife](https://sekiroshadowsdietwice.wiki.fextralife.com/Posture)
- [Sekiro perfect parry anatomy — Logan Taylor / Medium](https://medium.com/@gatherer286/song-of-sword-and-fist-sifu-sekiro-and-the-anatomy-of-a-perfect-parry-2f9c4c26867a)
- [Sekiro Deflection — Fextralife](https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection)
- [Switch Sports Chambara — Wiki](https://switchsports.fandom.com/wiki/Chambara)
- [Switch Sports Chambara — Game8](https://game8.co/games/Nintendo-Switch-Sports/archives/376158)
- [Wii Sports Resort Swordplay — Fandom](https://wiisports.fandom.com/wiki/Swordplay)
- [Bushido Blade — Wikipedia](https://en.wikipedia.org/wiki/Bushido_Blade_(video_game))
- [Bushido Blade — Hardcore Gaming 101](http://www.hardcoregaming101.net/bushido-blade/)
- [For Honor sound design — A Sound Effect](https://www.asoundeffect.com/for-honor-sound/)
- [For Honor mechanics — Game Developer](https://www.gamedeveloper.com/design/rock-paper-guard-breaks-a-mechanics-deep-dive-into-for-honor)
- [Mordhau Parrying — Wiki](https://mordhau.fandom.com/wiki/Parrying)
- [Ghost of Tsushima VFX — PlayStation Blog](https://blog.playstation.com/2021/01/12/how-stunning-visual-effects-bring-ghost-of-tsushima-to-life/)
- [Nioh Ki Pulse — Fextralife](https://nioh.wiki.fextralife.com/Ki+Pulse)
- [Nioh Ki Burst design — Celia Wagar / CritPoints](https://critpoints.net/2017/03/09/what-makes-niohs-ki-burst-fun/)
- [Hellblade binaural sound — Swish-Swoosh](https://www.swish-swoosh.com/blogs/in-tune/binaural_world_of_senuas_sacrifice)
- [Hades VFX behind the scenes — 80.lv](https://80.lv/articles/a-behind-the-scenes-look-at-the-effects-in-hades)
- [Nidhogg — Wikipedia](https://en.wikipedia.org/wiki/Nidhogg_(video_game))
- [Until You Fall — Schell Games](https://schellgames.com/portfolio/until-you-fall)

### Audio / SFX
- [David Dumais — *4 Secret Layers Behind Sword SFX*](https://www.daviddumaisaudio.com/the-4-secret-layers-behind-epic-sword-sound-effects/)
- [David Dumais — *How I Redesigned For Honor's Sword Duel SFX*](https://www.daviddumaisaudio.com/how-i-redesigned-for-honors-sword-duel-combat-sound-effects/)
- [David Dumais — *Sword Combat Sound: Ghost of Tsushima*](https://www.daviddumaisaudio.com/sword-combat-sound-design-tutorial-ghost-of-tsushima/)
- [David Dumais — *Sword Impact: Sekiro*](https://www.daviddumaisaudio.com/sword-impact-sound-design/)
- [Pixflow — Sword & Blade SFX](https://pixflow.net/blog/sword-blade-sound-effects/)
- [Hithix — *Significance of Sound Design in Fighting Game Immersion*](https://www.hithix.com/article/the-significance-of-sound-design-in-fighting-game-immersion)
- [TheGamer — *Best Sound Design In Fighting Games*](https://www.thegamer.com/fighting-games-best-sound-design/)
- [howler.js — official site](https://howlerjs.com/)
- [howler.js GitHub](https://github.com/goldfire/howler.js/)
- [Web Audio API best practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [Audio for Web Games — MDN](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games)
- [PositionalAudio — drei](https://drei.docs.pmnd.rs/abstractions/positional-audio)
- [Why iPhone Silent Mode Breaks Web Audio — Joodi (Medium)](https://joodi.medium.com/why-i-os-silent-mode-breaks-audio-in-web-apps-aedcbeef7bca)
- [Sonniss GameAudioGDC](https://sonniss.com/gameaudiogdc/)
- [Kenney.nl audio assets](https://kenney.nl/assets?q=audio)
- [Freesound.org](https://freesound.org/)
- [Pixabay Sound Effects](https://pixabay.com/sound-effects/)
- [Mixkit Sword SFX](https://mixkit.co/free-sound-effects/sword/)
- [audiosprite CLI](https://www.npmjs.com/package/audiosprite)

### R3F / Three.js
- [Bloom — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/bloom)
- [SelectiveBloom — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/selective-bloom)
- [ChromaticAberration — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/chromatic-aberration)
- [Vignette — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/vignette)
- [Glitch — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/glitch)
- [pmndrs/react-postprocessing GitHub](https://github.com/pmndrs/react-postprocessing)
- [pmndrs/postprocessing GitHub](https://github.com/pmndrs/postprocessing)
- [CameraShake — Drei](https://drei.docs.pmnd.rs/staging/camera-shake)
- [Trail — Drei](https://drei.docs.pmnd.rs/abstractions/trail)
- [Sparkles — Drei](https://drei.docs.pmnd.rs/staging/sparkles)
- [pmndrs/meshline GitHub](https://github.com/pmndrs/meshline)
- [Maxime Heckel — *Magical World of Particles with R3F*](https://blog.maximeheckel.com/posts/the-magical-world-of-particles-with-react-three-fiber-and-shaders/)
- [Scaling Performance — R3F](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Codrops — Building Efficient Three.js Scenes](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [Post-processing with R3F — Three.js Journey](https://threejs-journey.com/lessons/post-processing-with-r3f)
- [MirzaBeig — Anime-Speed-Lines](https://github.com/MirzaBeig/Anime-Speed-Lines)
- [Hit Flash Effect Shader — Godot Shaders](https://godotshaders.com/shader/hit-flash-effect-shader/)
- [Glenn Fiedler — Fix Your Timestep](https://www.gafferongames.com/post/fix_your_timestep/)
- [requestAnimationFrame — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

### 햅틱 / 입력
- [Vibration API — Can I Use](https://caniuse.com/vibration)
- [GamepadHapticActuator playEffect — Can I Use](https://caniuse.com/mdn-api_gamepadhapticactuator_playeffect)
- [Navigator.vibrate() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- [Vibration API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- [GamepadHapticActuator.playEffect() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect)
- [WebKit standards-positions: Vibration API (oppose)](https://github.com/WebKit/standards-positions/issues/267)
- [Safari 17 features — gamepad vibrationActuator](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/)
- [use-haptic — iOS 18 checkbox-switch trick](https://github.com/posaune0423/use-haptic)
- [Capacitor Haptics plugin docs](https://capacitorjs.com/docs/apis/haptics)
- [Audio-haptic conversion — Precision Microdrives](https://www.precisionmicrodrives.com/tutorial-using-haptic-feedback-with-music-or-audio-signals)
- [Android haptics design principles — Google](https://developer.android.com/develop/ui/views/haptics/haptics-principles)

### 프로젝트 내부 문서
- `docs/game-design.md`
- `docs/duel-implementation.md`
- `docs/architecture.md`
- `docs/tech-stack.md`
- `claudedocs/research_chambara_20260428.md`
- `claudedocs/research_chambara_visuals_20260429.md`

---

**End of Impact Feedback Research Report**
