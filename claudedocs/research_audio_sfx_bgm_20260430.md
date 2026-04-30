# Audio Asset Plan — SFX & BGM Sourcing Research

> **작성일**: 2026-04-30 / **잼 마감**: 2026-05-01 13:37 UTC (~24h)
> **작성 트리거**: 시각 컨셉이 "Switch Sports 챔바라(콜로세움+사무라이)"에서 "사이버펑크 콜로세움 챔버 + 가시 함정 + 라이트세이버 + 시안/마젠타 네온 + 인더스트리얼 스카이라인"으로 전환됨 (commits `1915a0d`, `f98b7f6`, `d8617a4`). 기존 `docs/jam-polish-plan.md` §2.1의 SFX 12개 목록은 사무라이 메탈 톤 가정 — **재정렬 필요**.
> **선행 문서**: `docs/jam-polish-plan.md` §2.1, `client/src/duel/CLAUDE.md` (씬 톤), `claudedocs/research_chambara_visuals_20260429.md`

---

## 0. 핵심 결론 (TL;DR)

1. **현재 오디오 통합 0** — `client/public/audio/raw/`는 빈 폴더, 코드 어디에도 `Audio`/`Howler`/`AudioListener` 호출 없음. Phase 9 audio는 "에셋 도착 후" 블로킹 상태.
2. **컨셉 전환으로 SFX 12개 리스트 재정렬 필요** — 기존엔 사무라이 메탈 톤이었지만 지금은 **(a) 라이트세이버 hum loop**, **(b) 인더스트리얼 챔버 ambient**, **(c) 가시 함정 추락+impale**, **(d) 사이버펑크 BGM**이 추가로 필요.
3. **라이센스 안전 우선순위**: **CC0 > Pixabay > CC-BY**. 잼은 어트리뷰션 슬라이드 만들 시간 부족하므로 가능한 한 CC0/Pixabay 위주로 통일하고, 필수 항목만 CC-BY 사용.
4. **Star Wars "snap-hiss"는 Lucasfilm 사운드마크** — 영화 hum 클립 직접 사용 금지. 대신 **Web Audio API로 직접 합성한 hum loop**(가장 안전) 또는 Freesound CC0의 "plasma/energy blade hum"(영화 인용 X 표기) 사용.
5. **BGM 한 곡(인게임)으로 시작**으로 충분 — 매치 길이 ~90s, 잼 시연 ~3분이라 **1 인게임 루프 + 1 타이틀 루프 + 1 victory stinger**이면 70% 효과.
6. **단일 토픽 통합 라이브러리 추천 (사용자 시간 최소화)**:
   - SFX 베이스: **Kenney Sci-fi Sounds + UI Audio + Impact Sounds**(전부 CC0, 한 사이트에서 5분 다운)
   - BGM: **Tallbeard FREE Music Loop Bundle**(CC0, 200+ loops 한 ZIP) 또는 **Whitebataudio Free Cyberpunk Loop Pack**(royalty-free, 3 loops)
   - 라이트세이버 hum: **Web Audio 합성**(0 다운로드, 100% IP-안전, 코드 ~30줄)
   - 검투 SFX 보강: **Sonniss GameAudio GDC 2026 bundle**(royalty-free, ~2 GB 한 ZIP에 검·임팩트·sci-fi 다 포함)
   - 라스트 리조트: Pixabay/Freesound 핀포인트 검색

---

## 1. 변경된 컨셉이 오디오 디자인에 의미하는 것

### 1.1 시각 톤 매트릭스 (현재 vs 이전)

| 축 | 이전(챔바라/사무라이) | 현재(사이버펑크 콜로세움) | 오디오 함의 |
|---|---|---|---|
| 환경 | 일본풍 콜로세움 + 물 | 인더스트리얼 챔버 + 가시 함정 + 도시 스카이라인 | **Ambient 톤 변경**: 자연 ambient → low-rumble drone, factory hum, distant city |
| 조명 | 따뜻한 토치 + 황금시간 sandstone | 시안/마젠타 네온 + 문라이트 + 빨간 ember | **BGM**: 어쿠스틱/태고드럼 X → **synthwave/cyberpunk/dark electro** |
| 무기 | "사무라이 카타나"라고 가정 | **라이트세이버 풍 emissive blade**(시안/마젠타 코어) | **검 사운드**: 강철 스윙 → **plasma hum loop + 에너지 swing whoosh + 전기 spark clash** |
| Ringout | 물에 떨어짐 ("splash") | **가시 함정 impale**(빨간 ember tip 480개) | **KO 사운드**: splash → **추락 whoosh + 메탈 piercing + 짧은 grunt** |
| 분위기 | 라운드 시작 = 종 | "industrial" 톤 + 크라우드는 floating drone | **Round bell**: 전통 boxing bell → **sci-fi air-horn / synth siren / synthesized "ding" with sub-bass** |

### 1.2 추가/변경 카테고리

기존 jam-polish-plan §2.1의 12개 리스트는 그대로 유지하되 **음색 의도만 바꿈**(예: "block = 메탈 spark" → "block = 메탈 + 전기 sizzle"). 추가로 5개 카테고리가 신규로 필요:

- **BGM 트랙** (없음 → 1~3개)
- **Arena ambient loop** (없음 → 1개)
- **라이트세이버 hum loop** (없음 → 1개, ideally 합성)
- **UI 사운드** (없음 → 4개: hover/click/back/match-found)
- **가시 함정 impale + fall whoosh** (KO 사운드를 분리/대체)

---

## 2. 최종 필요 자산 목록 (재정렬판)

> 형식: `파일명` — 의도 / 길이 / 컨셉 키워드 / 우선순위(P0/P1/P2) / 변형 수
>
> 저장 위치: `client/public/audio/raw/<파일명>` (OGG 또는 WAV). audiosprite·정규화는 코드 통합 시 처리.

### 2.1 BGM (Background Music) — **NEW 카테고리**

| # | 파일명 | 의도 | 길이 / 루프 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| B1 | `bgm_match.ogg` | 인게임 매치 BGM. 텐션 유지하면서 임팩트 위에 듀어드 X | 60–120s seamless loop | "cyberpunk combat", "synthwave tension", "dark electro" | **P0** |
| B2 | `bgm_title.ogg` | 타이틀 화면 분위기 잡기 | 30–90s loop | "synthwave intro", "neon ambient", "cyberpunk menu" | **P1** |
| B3 | `bgm_victory.ogg` | 매치 종료 시 5–8초 짧은 stinger (loop X) | 4–8s one-shot | "synthwave win", "8-bit victory", "neon stinger" | **P1** |
| B4 | `bgm_defeat.ogg` | 패배 시 짧은 stinger (B3와 톤 정반대) | 4–8s one-shot | "synthwave loss", "downer sting" | **P2** |

**튜닝 노트**: 인게임 BGM 음량은 SFX 대비 **-12~-18 dB**. 매치 텐션 빌드는 코드(Phase 13~15에서 추가) 보다는 한 트랙으로 처리.

### 2.2 Arena Ambient Loop — **NEW 카테고리**

| # | 파일명 | 의도 | 길이 / 루프 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| A1 | `ambient_chamber.ogg` | 인더스트리얼 챔버 base hum + distant city | 15–30s seamless loop | "industrial drone hum", "factory ambient", "sci-fi chamber room tone" | **P1** |
| A2 | `ambient_pit_sizzle.ogg` | 가시 함정 빨간 ember의 약한 sizzle (positional, 낮은 볼륨) | 5–10s loop | "ember sizzle", "low fire crackle", "lava hiss soft" | **P2** |

### 2.3 Saber-Specific (IP-안전) — **NEW 카테고리**

| # | 파일명 | 의도 | 길이 | 키워드 / 메모 | 우선순위 |
|---|---|---|---|---|---|
| S1 | `saber_hum.ogg` 또는 **Web Audio 합성** | 검 활성 시 지속 hum loop. **합성 권장** (IP 100% 안전 + 0 다운로드) | 1–2s seamless loop | "plasma blade hum", "energy sword idle". Web Audio: sine 60Hz + saw 120Hz + low-pass 800Hz + LFO 5Hz tremolo + amp 0.15 | **P0** |
| S2 | `saber_swing.ogg` | 슬라이스/찌르기 모션 시 whoosh. 일반 sword swing보다 약간 전기 톤 가미 | 200–400ms × 3 변형 | "lightsaber swoosh", "energy whoosh", "plasma swing" | **P0** |
| S3 | `saber_clash.ogg` | block 시 검 vs 검. 메탈 + 전기 sizzle | 300–500ms × 2 변형 | "lightsaber clash", "energy clang", "plasma spark hit" | **P0** |
| S4 | `saber_ignite.ogg` | (옵션) 라운드 시작 시 검 켜지는 짧은 SFX. **snap-hiss 인용 회피** — 약한 ramp-up hum만 | 300ms one-shot | "energy weapon power up", "plasma ignite". **금지: Star Wars snap-hiss 사운드 직접 사용** | P2 |

### 2.4 Combat Impact SFX (기존 12개 리스트 재배치)

| # | 파일명 | 의도 | 길이 / 변형 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| C1 | `block.ogg` | block outcome — **밝은 메탈 spark + 전기**. flesh 0, sub-bass 최소 | 300ms × 2 변형 | "metal clang bright", "electric spark hit", "high-pitch clash" | **P0** |
| C2 | `pierce.ogg` | pierce outcome — **저주파 thud + 짧은 메탈 scrape**. block과 음색 정반대 | 400ms | "dark thud armor", "low metallic pierce", "body impact deep" | **P0** |
| C3 | `hit.ogg` | hit outcome — body thud + sub-bass | 400ms × 2 변형 | "body thud impact", "punch flesh deep", "anime hit hard" | **P0** |
| C4 | `grunt.ogg` | 피격/스턴/KO 시 짧은 호흡. 분리 트리거 | 200–400ms × 2 (M/F 옵션) | "male grunt short pain", "fighter exhale" | **P1** |
| C5 | `windup.ogg` | 공격 텔레그래프(rising metal ring) | 280ms | "rising tension hum", "weapon charge", "metal ring rising" | **P1** |
| C6 | `counter_open.ogg` | block 후 600ms counter window 진입 신호 (sine sweep) | 250ms | "rising shimmer", "magic charge sparkle", "sine sweep up 400-1200Hz" | **P1** |

### 2.5 Movement / Footstep

| # | 파일명 | 의도 | 변형 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| M1 | `footstep.ogg` | 데크(메탈) 위 발걸음 | × 3 변형 | "metal grate step", "deck plate footstep", "industrial boot soft" | **P1** |

### 2.6 Match Flow

| # | 파일명 | 의도 | 길이 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| F1 | `bell_round_start.ogg` | 라운드 시작 신호 — **인더스트리얼 변형**(원형 boxing bell 대신 sci-fi air-horn 또는 synth ding with sub-bass) | 1–2s | "sci-fi siren short", "synth horn signal", "futuristic ding" | **P0** |
| F2 | `countdown_beep.ogg` | 카운트다운 (3-2-1) | 150ms one-shot, 코드에서 피치 0.9/1.0/1.1 | "ui beep short", "countdown tick", "synth tone short" | **P0** |
| F3 | `ko_splash.ogg` | KO 시 라운드 종료 임팩트 (가시 함정 추락 시) | 1.5s | **신규 의도**: heavy thud → metal piercing scrape → soft echo. `pit_impale.ogg`와 통합 가능 | **P0** |
| F4 | `pit_impale.ogg` | (선택) ringout = 가시 핏 추락 시 fall whoosh + spike impact + grunt | 1.0s | "body fall whoosh", "metal pierce", "spike impact deep" | P1 |

### 2.7 UI Sounds — **NEW 카테고리**

| # | 파일명 | 의도 | 길이 | 키워드 | 우선순위 |
|---|---|---|---|---|---|
| U1 | `ui_hover.ogg` | 메뉴 버튼 hover | 80ms | "ui hover soft", "menu hover futuristic" | **P1** |
| U2 | `ui_click.ogg` | 메뉴 클릭/select | 100ms | "ui click sci-fi", "button confirm synth" | **P0** |
| U3 | `ui_back.ogg` | 캔슬/back | 120ms | "ui back deny", "menu cancel sci-fi" | P2 |
| U4 | `ui_match_found.ogg` | 랭크 매칭 성공 시 알림 | 800ms | "notification ping sci-fi", "match found alert" | P1 |

**총 예산** (모두 다 모으면): BGM 4 + Ambient 2 + Saber 4 + Combat 6 + Movement 1 + Match 4 + UI 4 = **25 파일**.

**P0 최소 셋** (잼 시연용 골든 패스): B1 + S1(합성) + S2 + S3 + C1 + C2 + C3 + F1 + F2 + F3 + U2 = **11개**. 1.5h 안에 모을 수 있음.

---

## 3. 라이센스 안전 매트릭스

| 라이브러리 | 라이센스 | 어트리뷰션 | 상업 사용 | 잼 적합도 |
|---|---|---|---|---|
| Kenney.nl | CC0 (Public Domain) | **불필요** | 가능 | ★★★★★ |
| Pixabay Music + SFX | Pixabay License | **불필요** | 가능 (단, 단독 재배포 금지) | ★★★★★ |
| Freesound (CC0 필터) | CC0 | **불필요** | 가능 | ★★★★★ |
| Freesound (CC-BY 필터) | CC-BY | **필요** (저자명 + 링크) | 가능 | ★★★☆ (어트리뷰션 슬라이드 필요) |
| OpenGameArt (CC0) | CC0 | **불필요** | 가능 | ★★★★★ |
| Mixkit | Mixkit License | **불필요** | 가능 (게임/앱 OK) | ★★★★ |
| Sonniss GDC Bundle | Royalty-free, no attribution | **불필요** | 가능 | ★★★★★ |
| Tallbeard Music Loop Bundle | CC0 | **불필요** | 가능 (커피머니 권장) | ★★★★★ |
| Whitebataudio Free Cyberpunk Loop | "100% royalty free" | 권장 (필수 X) | 가능 | ★★★★ |
| Eric Matyas / soundimage.org | Custom (CC-BY-like) | **필요** | 가능 | ★★★ (어트리뷰션 필수) |
| Ovani Sound | 유료 라이센스 | — | 라이센스에 따라 | ★★ (잼 시간/예산 부적합) |
| Epidemic Sound / Uppbeat / Artlist | 구독제 | — | 구독 시 가능 | ★ (잼 부적합) |

**잼 권장 정책**: **CC0 + Pixabay + Sonniss GDC** 3중 우선. 어트리뷰션은 필수일 때만.

**라이센스 함정 회피**:
- Freesound에서 **반드시 sound 페이지의 "License" 박스**로 라이센스 재확인. 같은 작가가 CC0/CC-BY 섞어 올림.
- Pixabay 음원은 **게임 안에서 재생 OK이지만 OGG 파일 자체를 재배포 X**. 빌드 ZIP 업로드는 OK (게임의 일부니까).
- Star Wars 영화 hum 클립 (예: "lightsaber.mp3" 으로 인터넷 떠도는 것)은 **Lucasfilm 트레이드마크/저작권** — 직접 사용 X.

---

## 4. 카테고리별 최적 자료 (구체 추천)

### 4.1 BGM — **첫 번째 추천: Tallbeard Studios FREE Music Loop Bundle**

- **링크**: https://tallbeard.itch.io/music-loop-bundle
- **라이센스**: CC0 (Abstraction Music + Tallbeard Studios)
- **수량**: 200+ seamless loops, 모든 장르 (cyberpunk/synthwave/dark/tension 포함)
- **추천 이유**: 한 ZIP 다운로드로 BGM 4개(B1~B4) 후보를 한 번에 확보. CC0이라 어트리뷰션 슬라이드 불필요. 이미 게임 안에서 잼 출품작 다수 사용 → 검증됨.
- **사용법**: ZIP 풀고 "Cyberpunk", "Synthwave", "Tension", "Battle" 폴더 위주로 1–2개 골라 `bgm_match.ogg` / `bgm_title.ogg`로 리네임.

**보완: Whitebataudio Free Cyberpunk Loop Pack**

- **링크**: https://whitebataudio.itch.io/free-cyberpunk-loop-pack
- **라이센스**: 100% royalty-free
- **수량**: 3 loops (cyberpunk dark synthwave 핀포인트)
- **추천 이유**: Tallbeard 번들이 너무 광범위하면 이거 하나로 핀포인트 톤 가능. Whitebataudio는 같은 작가가 유료 "Grid Runner Music Pack"도 운영 → 톤 일관성 검증.

**Victory stinger 전용 (B3) 추천**: Pixabay에서 "victory stinger short" 검색 → 4–8초 짜리 무료 다운.

### 4.2 Arena Ambient (A1) — **Freesound CC0 핀포인트**

- **검색 페이지**: https://freesound.org/search/?q=industrial+factory+drone&f=license:%22Creative+Commons+0%22
- **구체 추천 후보**:
  - "Industrial/Factory Fans Loop Soundscape" by IanStarGem ([freesound 271096](https://freesound.org/people/IanStarGem/sounds/271096/)) — 잼 톤에 직격
  - "Sci-fi Ambient Drone.wav" by LookIMadeAThing ([freesound 534018](https://freesound.org/people/LookIMadeAThing/sounds/534018/)) — chamber 베이스
  - "Quasi Drone" by bassimat ([freesound 840934](https://freesound.org/people/bassimat/sounds/840934/)) — dual-oscillator slow drone
- **사용법**: 1개 골라서 Audacity로 fade-in/out + 15–30s seamless loop 만들고 `ambient_chamber.ogg`로 저장.

### 4.3 라이트세이버 Hum (S1) — **Web Audio 합성 (가장 안전 + 빠름)**

**왜 합성 추천?**
1. **IP 100% 안전**. Lucasfilm은 영화 hum 클립의 사운드마크 등록을 시도해왔음 — 합성 사운드는 그 어떤 클립과도 무관.
2. **다운로드 0**. Phase 9 audio 작업 시간 단축.
3. **품질**: 라이트세이버 hum의 핵심은 "low sine + saw + tremolo LFO"인데 Web Audio로 ~30줄.
4. **검 가드 활성 시 emissive intensity 변화에 hum 볼륨/필터 동기화 가능** — 사운드와 시각이 결합되는 polish.

**최소 코드 패턴**:
```ts
// client/src/duel/audio/saberHum.ts
import { Howler } from "howler";

export function createSaberHum(saberColor: "cyan" | "magenta") {
  const ctx = Howler.ctx; // howler가 만든 AudioContext 재사용
  const baseFreq = saberColor === "cyan" ? 65 : 70; // magenta = 약간 더 높은 핏치

  const osc1 = ctx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = baseFreq;
  const osc2 = ctx.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = baseFreq * 2;
  const osc3 = ctx.createOscillator(); osc3.type = "triangle"; osc3.frequency.value = baseFreq * 3;

  const lfo = ctx.createOscillator(); lfo.frequency.value = 5; // 5 Hz tremolo
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 800; filter.Q.value = 1.2;

  const masterGain = ctx.createGain(); masterGain.gain.value = 0.0; // mute on init
  lfoGain.connect(masterGain.gain); // tremolo modulates master

  osc1.connect(filter); osc2.connect(filter); osc3.connect(filter);
  filter.connect(masterGain); masterGain.connect(ctx.destination);

  osc1.start(); osc2.start(); osc3.start(); lfo.start();

  return {
    setActive(active: boolean) {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(active ? 0.18 : 0.0, now, 0.05);
    },
    setIntensity(intensity: number) {
      // 가드 활성 시 (0..1) 추가 boost
      filter.frequency.setTargetAtTime(800 + intensity * 400, ctx.currentTime, 0.1);
    },
  };
}
```

**대안 (다운로드 선호 시)**: Freesound CC0 hum 검색
- https://freesound.org/browse/tags/lightsaber/ → CC0 필터
- "Lightsaber Hum and Swings 2" by Sheyvan ([freesound 703384](https://freesound.org/people/Sheyvan/sounds/703384/)) — synth + noise mix, 라이센스 페이지에서 CC0 재확인 필요
- Pixabay 검색: https://pixabay.com/sound-effects/search/lightsaber/ → Pixabay 라이센스, 어트리뷰션 불필요

### 4.4 검 Swing/Clash (S2, S3) — **Sonniss GameAudio GDC 2026 + Pixabay 폴백**

- **Sonniss GameAudio GDC 2026 Bundle**:
  - 링크: https://gdc.sonniss.com/
  - 라이센스: Royalty-free, no attribution (https://sonniss.com/gdc-bundle-license/)
  - 추천 이유: 매년 무료 ~2GB 번들에 sword/sci-fi weapon 풍부. 한 번 다운으로 전 카테고리 커버. 잼 출품작 다수 사용 → 검증.
  - 추가 옵션: Sonniss "Sci-Fi Weapons Pack 1" (유료 풀팩 — 잼에는 GDC 무료팩으로 충분).
- **Pixabay 폴백** (Sonniss 다운 시간 부족할 때):
  - Sword swing: https://pixabay.com/sound-effects/search/sword-swing/
  - Sword clash: https://pixabay.com/sound-effects/search/sword%20clash/
  - Metal impact: https://pixabay.com/sound-effects/search/metal-impact/

### 4.5 Combat Impact (C1~C6) — **Kenney + Sonniss**

- **Kenney "Impact Sounds"** (CC0): https://kenney.nl/assets/impact-sounds — 다양한 impact 80+ 파일
- **Kenney "Sci-fi Sounds"** (CC0, 70 assets): https://kenney.nl/assets/sci-fi-sounds — sci-fi 가미 톤
- **Sonniss GDC**: 같은 번들로 grunt + windup + counter_open 보강
- **Freesound CC0 grunt**: https://freesound.org/search/?q=grunt+male+pain&f=license:%22Creative+Commons+0%22

### 4.6 Footstep (M1) — **Kenney 또는 Freesound**

- Kenney 번들에 footstep 다양 포함
- Freesound CC0 검색: "footstep metal grate" 또는 "footstep metal deck"

### 4.7 Match Flow (F1, F2, F3, F4) — **Pixabay + Sonniss**

- Round bell (F1, **인더스트리얼 변형**): Pixabay "siren short" 또는 "sci-fi horn"
- Countdown beep (F2): Kenney UI Audio의 짧은 beep + 코드에서 피치 시프트
- KO splash (F3): Pixabay "body fall heavy" + "metal impact deep" 합성. 또는 Sonniss "explosion impact" 짧게.
- Pit impale (F4, 선택): Freesound CC0 "spike impale" 또는 Sonniss horror 카테고리.

### 4.8 UI Sounds (U1~U4) — **Kenney UI Audio (단일 권장)**

- **Kenney UI Audio**: https://kenney.nl/assets/ui-audio
  - 라이센스: CC0
  - 수량: 50 sounds (button click/switch/generic 다양)
  - 추천 이유: 잼 사이파이 톤에 깔끔히 매칭. 한 번 다운으로 U1~U4 전부 커버.
- **Kenney "Interface Sounds"** (보강): https://kenney.nl/assets/interface-sounds

---

## 5. 권장 다운로드 워크플로 (사용자 1.5h 안에 완료)

### 5.1 골든 패스 (P0만)

```
1. Tallbeard Music Loop Bundle 다운 (5 min)
   → ZIP 풀고 cyberpunk/synthwave 1개 골라 `bgm_match.ogg` 리네임
2. Kenney Sci-fi Sounds + UI Audio + Impact Sounds 다운 (10 min)
   → 각 ZIP 풀어 raw/ 폴더에 통째로 넣어두기 (선별은 코드 통합 시)
3. Sonniss GameAudio GDC 2026 Bundle 다운 (15-30 min, 2GB)
   → 풀어 raw/ 옆 폴더에 보관 (선별은 코드 통합 시)
4. Freesound CC0 핀포인트 (15 min):
   - ambient_chamber.ogg (industrial factory drone)
   - grunt.ogg (male grunt short pain)
5. Pixabay 보충 (5 min):
   - bell_round_start.ogg (sci-fi siren short)
6. 라이트세이버 hum은 다운로드 X — 코드 합성으로 처리
```

**총 다운로드 시간 ~1h, 선별/리네임 ~30 min.**

### 5.2 풀 리스트 (P1, P2 포함)

위 5.1에 추가:
```
7. bgm_title.ogg / bgm_victory.ogg / bgm_defeat.ogg — Tallbeard 번들에서 추가 픽
8. ambient_pit_sizzle.ogg — Freesound CC0 "ember sizzle"
9. counter_open.ogg — Freesound CC0 "rising shimmer" 또는 Web Audio 합성
10. ui_match_found.ogg — Kenney UI Audio에서 픽
11. pit_impale.ogg — Sonniss horror 카테고리 + Pixabay "body fall metal"
```

---

## 6. 코드 통합 시 처리 (참고용 — Phase 9 audio)

> 이 섹션은 jam-polish-plan §1 Phase 9를 컨셉 변경에 맞춰 업데이트한 노트입니다. 실제 구현은 사용자가 자료 던지고 나서 AI가 진행.

1. **howler.js 도입** (`yarn workspace @vibejam/client add howler` + `@types/howler`).
2. **audiosprite CLI** (`npx audiosprite --output public/audio/duel raw/*.ogg`)로 12~25 OGG → 단일 sprite (`duel.ogg` + `duel.json`).
   - 이슈: Tallbeard BGM은 60s+이라 sprite에 넣지 말고 **별도 streaming Howl**로 로드. SFX만 sprite.
3. **모듈 구조** (`client/src/duel/audio/`):
   - `playSfx.ts` — howler sprite + 모바일 unlock + per-outcome 매핑
   - `saberHum.ts` — Web Audio 합성 (4.3 코드)
   - `bgmController.ts` — `bgm_match` Howl streaming + 매치 phase에 따라 재생/페이드
   - `ambientController.ts` — `ambient_chamber` 무한 loop, dialog/menu 시 페이드
4. **OUTCOME → SFX 매핑** (`dispatchImpactFx.ts` 확장):
   - BLOCK → C1 + S3 (saber clash) + 짧은 saber hum filter sweep
   - PIERCE → C2 + 깊은 thud
   - HIT → C3 + C4 (grunt)
   - KO → F3 + C4 (grunt) + slo-mo와 BGM ducking
5. **Pitch 랜덤** (±5–8% impacts, ±10–15% swing/footstep). Velocity-based volume `lerp(0.6, 1.0, swingForce)`.
6. **Match flow integration**:
   - Round start → F1 (bell)
   - Countdown 3-2-1 → F2 × 3, 피치 0.9/1.0/1.2
   - Match start → BGM B1 fade in
   - Match over → BGM ducking + B3 stinger
   - Saber active (idle 끝나고 매치 시작 후) → S1 hum fade in (volume 0 → 0.18), 가드 시 filter freq +400 Hz
7. **모바일 unlock**: 첫 사용자 입력 (TitleScreen 캐릭터 클릭) 시 `Howler.ctx.resume()` + 무음 1프레임 sprite play.
8. **iOS 햅틱 폴백**: 60Hz sub-bass synth oscillator (Phase 9 #22 그대로 유지).

---

## 7. 리스크 / 함정

| 리스크 | 완화책 |
|---|---|
| 잼 마감 24h 내 음원 이름 / 라이센스 슬라이드 작성 부담 | CC0 + Pixabay 위주 → 어트리뷰션 슬라이드 자체 불필요 |
| BGM과 SFX 음량 충돌 (특히 KO 시) | BGM ducking (KO 시 -8 dB 600ms) — Phase 9 코드에서 처리 |
| iOS Safari 모바일에서 Web Audio AutoPlay 정책 | `Howler.ctx.resume()` + 첫 user gesture에서 unlock (Howler가 자동 처리) |
| audio sprite 파일이 너무 크면 첫 로드 지연 | BGM은 sprite 제외하고 streaming. SFX sprite는 ~500KB 목표 |
| Star Wars hum 클립 잘못 사용 | Web Audio 합성으로 대체 (4.3) |
| iOS Safari OGG 호환성 | howler가 webm 폴백 자동 처리. 단, sprite는 `--output-format mp3,ogg` 듀얼 |
| Tallbeard 번들 200곡 중 매치 톤에 안 맞는 곡 골라버리기 | "synthwave-action" / "cyberpunk-tension" 폴더에서만 픽. 30s 미리듣기로 검증 |

---

## 8. 결정 사항 (2026-04-30 사용자 확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| 라이트세이버 hum | **Web Audio 합성** (§4.3) | reactive 시각-사운드 결합 (가드/스턴/KO/무기별/캐릭터별 차별화) — 샘플 다운으론 불가 |
| BGM 트랙 수 | **3개** — `bgm_title.ogg` / `bgm_match.ogg` / `bgm_victory.ogg` | 타이틀/인게임/victory 모두 P0로 격상. `bgm_defeat.ogg`(B4)는 P2 잔존 |

### 8.1 합성 hum의 reactive 매핑 (확정)

| 트리거 | 효과 | 대상 게임 상태 |
|---|---|---|
| 무기 = BASIC | base freq 65Hz, sine + saw + triangle 3-osc | 기본 |
| 무기 = CHARGE | sub-bass 32Hz osc 추가, LFO 7Hz로 가속, filter Q 높여 톤 두껍게 | charge sword always-on core 이미 비주얼로 시각화 → 사운드도 동기화 |
| 무기 = RAPIER | base freq 90Hz, sub-bass X, filter Q 1.8, master gain 0.14 | 가늘고 높은 metallic 톤 |
| 캐릭터 = magenta(Beta) | base freq +5Hz | 시안 vs 마젠타 사이드 차별화 |
| 가드 활성 | filter freq 800 → 1200Hz lerp(0.1), LFO depth × 1.5 | `s.guard.active` (이미 emissive intensity 0→1.5 lerp와 동기화) |
| 스턴 | pitch -10% bend, filter 600Hz, master gain 0.10 | `s.stunSource` 진입 시 |
| 슬라이스 모션 중 | LFO 5Hz → 8Hz 가속 | `phase = "windup"/"slashing"` |
| Block clash | filter freq 1500Hz까지 0.05s sweep → 800Hz 복귀 | BLOCK outcome 발화 시 |
| KO slo-mo | filter freq + LFO 속도를 `useTimeScale.scale`에 곱셈 | `useTimeScale.koEnvelope` active |

### 8.2 음원 검수 / 라이센스 정책 (확정)

- **CC-BY 허용** — 음질 우선, 마음에 드는 CC-BY 후보가 없을 때만 CC0/Pixabay로 폴백.
- **Credits 화면 필요**: TitleScreen 하단 "Credits" 링크 → 모달/페이지에 사용한 CC-BY 음원 저자/링크/라이센스 표기. 잼 마감 전 Phase 9 audio 작업 끝부분에 추가.
- 사용자가 §5.1 골든 패스로 직접 다운/리네임 → AI는 raw/ 받은 뒤 audiosprite + 통합 + Credits 화면 자동 생성.
- 다운로드 시 음원 파일명에 저자명 살려두기 권장 (예: `bgm_match__mokkamusic.ogg`) → AI가 Credits 자동 추출.

### 8.3 신규 작업: Credits 화면

| # | 작업 | 위치 |
|---|---|---|
| C1 | `client/src/duel/audio/credits.ts` — `{ file, title, author, sourceUrl, license }[]` 데이터 |
| C2 | `TitleScreen.tsx` 하단에 "Credits" 텍스트 링크 추가 |
| C3 | `CreditsModal.tsx` 신규 — Credits 데이터를 리스트로 렌더, ESC/외부 클릭으로 닫기 |

---

## 9. 참조

- `docs/jam-polish-plan.md` §2.1 — 기존 12개 SFX 리스트 (이 문서가 재정렬)
- `client/src/duel/CLAUDE.md` — 사이버펑크 챔버 시각 톤 단일 진실 소스
- `claudedocs/research_chambara_visuals_20260429.md` — 시각 P0 작업 (Phase 8 완료)
- `claudedocs/research_impact_feedback_20260429.md` §3.2.2 — BLOCK vs PIERCE 음색 정반대 룰

### 외부 라이브러리

**CC0 / 어트리뷰션 불필요**
- [Kenney.nl Sci-fi Sounds (CC0, 70 assets)](https://kenney.nl/assets/sci-fi-sounds)
- [Kenney.nl UI Audio (CC0, 50 assets)](https://kenney.nl/assets/ui-audio)
- [Kenney.nl Impact Sounds (CC0)](https://kenney.nl/assets/impact-sounds)
- [Kenney.nl Interface Sounds (CC0)](https://kenney.nl/assets/interface-sounds)
- [Tallbeard FREE Music Loop Bundle (CC0, 200+ loops)](https://tallbeard.itch.io/music-loop-bundle)
- [Sonniss GameAudio GDC 2026 (royalty-free)](https://gdc.sonniss.com/)
- [Sonniss GDC archive 전체 history](https://sonniss.com/gameaudiogdc/)
- [Sonniss GDC bundle license terms](https://sonniss.com/gdc-bundle-license/)
- [Whitebataudio Free Cyberpunk Loop Pack (royalty-free)](https://whitebataudio.itch.io/free-cyberpunk-loop-pack)
- [OpenGameArt CC0 Sound Effects](https://opengameart.org/content/cc0-sound-effects)
- [OpenGameArt 50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx)
- [Mixkit Free Sword Sound Effects](https://mixkit.co/free-sound-effects/light-saber/)
- [Mixkit Thud SFX](https://mixkit.co/free-sound-effects/thud/)

**Pixabay (어트리뷰션 불필요, 자체 라이센스)**
- [Pixabay License terms](https://pixabay.com/service/license-summary/)
- [Pixabay Music (cyberpunk 카테고리)](https://pixabay.com/music/search/cyberpunk/)
- [Pixabay sword swing SFX](https://pixabay.com/sound-effects/search/sword-swing/)
- [Pixabay sword clash SFX](https://pixabay.com/sound-effects/search/sword%20clash/)
- [Pixabay metal impact SFX](https://pixabay.com/sound-effects/search/metal-impact/)
- [Pixabay lightsaber SFX](https://pixabay.com/sound-effects/search/lightsaber/)
- [Pixabay low-hum SFX](https://pixabay.com/sound-effects/search/low-hum/)

**Freesound (CC0 또는 CC-BY, 라이센스 항목별 확인 필수)**
- [Freesound lightsaber tag](https://freesound.org/browse/tags/lightsaber/)
- [Sheyvan Lightsaber Hum and Swings 2](https://freesound.org/people/Sheyvan/sounds/703384/)
- [LookIMadeAThing Sci-fi Ambient Drone (CC0)](https://freesound.org/people/LookIMadeAThing/sounds/534018/)
- [IanStarGem Industrial/Factory Fans Loop](https://freesound.org/people/IanStarGem/sounds/271096/)
- [Fission9 Drone Loop](https://freesound.org/people/Fission9/sounds/567220/)
- [bassimat Quasi Drone](https://freesound.org/people/bassimat/sounds/840934/)
- [AlaskaRobotics ambient spacecraft hum](https://freesound.org/people/AlaskaRobotics/sounds/221570/)
- [Freesound license FAQ](https://freesound.org/help/faq/)
- [Audio Commons CC license guide](https://audiocommons.github.io/2019/01/04/cc-licenses.html)

**어트리뷰션 필요 (잼 시간 충분 시만)**
- [Eric Matyas / Soundimage.org](https://soundimage.org/)
- [Free-Stock-Music CC-BY 카테고리](https://www.free-stock-music.com/search.php?keyword=cyberpunk)

**유료 / 잼 부적합 (참고용)**
- [Ovani Sound Electronic Music Pack](https://ovanisound.com/products/electronic-music-pack-vol-1)
- [Epidemic Sound](https://www.epidemicsound.com/sound-effects/)

### 기술 레퍼런스

- [howler.js 공식 사이트](https://howlerjs.com/)
- [howler.js GitHub](https://github.com/goldfire/howler.js/)
- [audiosprite CLI](https://github.com/tonistiigi/audiosprite)
- [howler.js audio sprite 가이드](https://medium.com/game-development-stuff/how-to-create-audiosprites-to-use-with-howler-js-beed5d006ac1)
- [Web Audio API 공식 (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Web Audio Advanced Techniques (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)
- [Web Audio Synth Envelopes (Chris Lowis)](https://chrislowis.co.uk/2013/06/17/synthesis-web-audio-api-envelopes)
- [Web Audio Synthesis tutorial (Sonoport)](https://sonoport.github.io/synthesising-sounds-webaudio.html)

---

**End of Audio Asset Plan**
