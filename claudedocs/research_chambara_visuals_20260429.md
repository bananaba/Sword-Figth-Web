# Chambara Duel — 그래픽 처리 리서치 (R3F + Three.js, PC 우선)

> **목적**: Switch Sports Chambara 영상/스크린샷 분석 + 우리 기술 스택(Vite + React + Three.js + R3F + Colyseus, 웹 PC 우선)에 맞춘 그래픽 구현 방향 제시
> **작성일**: 2026-04-29
> **선행 문서**: `docs/tech-stack.md`, `docs/architecture.md`, `docs/game-design.md`, `docs/prototypes.md`, `claudedocs/research_chambara_20260428.md`
> **출력 정책**: 리서치 보고서 — 코드 변경 없음. 구현은 사용자 결정 후 별도 단계로.

---

## Executive Summary

Switch Sports Chambara의 비주얼은 **친근한 카툰/토이(toy-like) 스타일**, **콜로세움형 원형 발판 + 청록색 물**, **검의 상태별 색 변화(가드 시 파란색, 풀차지 시 빛나는 사이언)**, **빠른 스윙 트레일과 임팩트 임펄스 이펙트**가 핵심 시각 언어다. R3F 환경에서 이 톤을 재현할 핵심 도구는 **MeshToonMaterial**(셀셰이딩), **`meshline`**(검 트레일), **`@react-three/postprocessing`의 selective bloom**(검 글로우/풀차지), **stylized water shader**(청록색 카툰 물).

PC 우선·잼 일정 제약을 고려하면 **풀모방보다 핵심 시그니처(검 색 변화, 임팩트, 물 + 콜로세움) 3-4개에 집중**하는 게 비용 대비 효과 큼. 본 보고서는 시각 요소를 우선순위별로 분류하여 P0(필수)·P1(권장)·P2(여유시)로 제시.

---

## 1. 원작 챔버라의 시각 언어 분석

### 1.1 캐릭터 / 의상

원작은 **Sportsmate**(Mii의 발전형 아바타)를 사용. 챔버라 의상은 **검도 보호구(kendo equipment) 기반** — 검은/청색 도복 비슷한 의상에 머리 방어구, 손목 보호대.

| 요소 | 원작 표현 |
|---|---|
| 캐릭터 모델 | 둥글둥글한 toy-like 비례, 셀셰이딩에 가까운 단순 라이팅 |
| 의상 | 검도풍 도복(짙은 색, 단색 면 + 약한 그라디언트), 사이드별로 빨강/파랑 색 구분 가능 |
| 머리 방어구 | 단순화된 면(面, men) — 카툰 스타일로 디테일 생략 |
| 손/검 그립 | 굵게 단순화 |

> 출처: Sportsmate은 "more clearly defined features and details than Miis"이며 의상/검은 검도 기반.

### 1.2 무대(콜로세움) / 환경

- **원형 단일 발판** (콜로세움 모티브) — 직경은 시각적으로 두 캐릭터 8-10보 정도로 보임
- **물 위에 부유** — 청록색/터쿼이즈에 가까운 카툰 물, 잔잔한 파동, 약한 코스틱
- **외곽 링 + 중앙 원의 두 동심원** — 서든데스 시 외곽 링이 물 속으로 가라앉고 중앙 원만 남음 → 같은 스테이지에 **두 단계 상태**가 인코딩됨
- **하늘** — 부드러운 그라디언트(원작은 연한 하늘색~크림), 멀리 산/구름이 살짝 보이는 정도

### 1.3 검 비주얼 / 상태 표현 (가장 중요한 시각 시그니처)

검은 게임의 핵심 캐릭터인 만큼 **상태 변화를 색·발광으로 강하게 표현**:

| 상태 | 시각 표현 |
|---|---|
| 일반 (Idle) | 무채색/실버, 살짝 반사 |
| **가드 활성 (홀드 중)** | **검신이 파란색(blue glow)으로 빛남** — 가장 명시적인 시각 신호 |
| **차지 검 풀차지** | 검 전체가 더 강한 글로우 + 파동, 일종의 "ready" 표시 |
| **트윈 소드 풀차지** | 양쪽 검이 모두 빛나며 회전 임펄스 표시 |
| 스윙 중 | 짧은 모션 트레일(slash trail), 임팩트 순간 사라짐 |

### 1.4 이펙트 / VFX

- **검 트레일**: 길이 짧고(0.3-0.5초) 끝이 가늘어지는 빌보드 라인, 색은 검 색을 따름
- **임팩트(검끼리 맞부딪힘)**: 작은 스파크 + 미니 카메라 셰이크 + 일시적 시간감속(stun 표시)
- **가드 성공**: 푸른 링 펄스(원형 충격파), 가드한 쪽 캐릭터 주변에서 발생
- **HIT 성공**: 빨간 링 펄스 + 피격자 큰 넉백 모션
- **KO(낙하)**: 캐릭터가 콜로세움 밖으로 날아가 물에 빠지면서 **물 splash + 동심원 파동**, 카메라가 잠깐 추격
- **서든데스 전환**: 외곽 링이 물 속으로 가라앉는 cinematic — 경기장 변화 자체가 연출

### 1.5 카메라

- **고정에 가까운 사이드뷰 + 약간 경사** — 두 캐릭터가 가로로 나란히 보이는 각도 (격투게임의 1.5인칭/2.5D 카메라와 유사)
- **임팩트나 KO 시 짧게 줌인/팬** — 시네마틱 강조
- 플레이어 시점 자체는 변화 없음 → 입력의 일관성(검 자세 시각화)이 흔들리지 않음

### 1.6 UI / HUD

- **상단 중앙 타이머** — 큰 숫자, 둥근 카툰 폰트
- **양쪽 상단 플레이어 이름 + 깃발(라운드 승점)** — 좌/우 색상 코딩
- **하단 중앙 차지 게이지**(차지 검/트윈 소드 사용 시) — 둥근 막대 또는 원형
- 전반적으로 **HUD가 작고 외곽에 배치** — 게임 플레이 시야 방해 최소

---

## 2. 우리 게임에 맞는 시각 스타일 권장

### 2.1 톤(테마) 결정 — 미결정 항목과 연결

`game-design.md` §6 미결정 사항 중 "테마 / 톤: 사무라이 원작 / SF 라이트세이버 / 메타 풍자 / 추상 미니멀"이 있는데, **그래픽 처리 난이도와 시각 명료성** 관점에서 비교:

| 테마 | 시각 작업량 | 잼 적합도 | 검 글로우 자연스러움 | 추천 |
|---|---|---|---|---|
| 사무라이 원작 카피 | 중상 (의상·도복 텍스처) | 중 | 어색 (사무라이 검은 보통 안 빛남) | △ |
| **SF 라이트세이버** | **저-중** (단순한 발광 검) | **상** | **자연스러움 (네온 검)** | **◎** |
| 메타 풍자 (예: AI 면접관 결투) | 중 (캐릭터 디자인 부담) | 상 | 자유롭게 활용 | ○ |
| 추상 미니멀 (Geometry Wars 풍) | 저 | 상 | 매우 자연스러움 (글로우가 메인) | ○ |

**추천**: **라이트세이버 톤** 또는 **추상 미니멀 + 네온**.
- 잼 30초 룰에 시각적으로 즉시 어필 (네온 글로우는 한 컷에 의도 보임)
- 검의 가드/차지 글로우가 테마와 일치 → 별도 정당화 불필요
- 의상/디테일 텍스처 부담 적음 (단색 + 발광이 핵심)
- Switch Sports의 토이 톤 그대로 가져오면 IP 기시감 이슈 잠재 — 약간 추상화/SF화하여 회피 가능

### 2.2 우선순위별 시각 요소 (P0 / P1 / P2)

| 우선 | 요소 | 잼 마감 시 효과 |
|---|---|---|
| **P0** | 검의 발광 + 가드 시 색 변화 (블루 글로우) | 한 컷에 게임 룰이 보이는 핵심 시그니처 |
| **P0** | 검 트레일(스윙 모션 가시화) | 마우스 입력의 시각 피드백 — 게임 감각 직결 |
| **P0** | 임팩트 이펙트(블록/히트 구분) | 직각 매칭이 작동하는지 시각으로 즉시 확인 |
| **P0** | 콜로세움 발판 + 물 (KO 컨디션 명료화) | "왜 떨어지면 안 되는지" 시각으로 학습 |
| P1 | 셀셰이딩(toon material) | 카툰 톤 통일 — 잼 출품작 사이에서 보기 좋은 차이 |
| P1 | 카메라 임팩트 셰이크 / KO 줌 | 클립 가치(트윗 직격) 향상 |
| P1 | 서든데스 외곽 링 가라앉기 | 매치 후반 긴장감 |
| P2 | 풀차지 검 발광 / 차지 게이지 HUD | 차지 검 도입 시 |
| P2 | 캐릭터 의상 디테일 | Tripo3D나 Quaternius 도입 시 |
| P2 | 하늘 그라디언트 + 코스틱 | 분위기 강화 |

P0 4개에 집중하면 **잼 30초 룰에 충분히 어필**, P1 추가 시 **품질감 상승**, P2는 시간 여유 시.

---

## 3. R3F + Three.js 구현 가이드 (각 시각 요소별)

### 3.1 검의 발광 / 가드 글로우 (P0)

**목표**: 검신이 가드 활성 시 파란색으로 발광, 풀차지 시 더 강하게.

**구현 방식**:

```
Mesh: 검 모델 (가늘고 긴 박스 또는 GLB)
Material: meshStandardMaterial (emissive 기반)
  - emissive: 가드/차지 상태별 색
  - emissiveIntensity: 상태별 0.0 → 2.0 (HDR 범위)

Postprocessing: @react-three/postprocessing의 <EffectComposer> + <Bloom>
  - luminanceThreshold = 1.0 (HDR 색만 블룸 적용 — selective bloom)
  - 일반 머티리얼은 0-1 범위 → 블룸 안 됨
  - 검의 emissive만 1.0 초과 → 자연스럽게 발광 효과
```

이 패턴을 **selective bloom**이라 하며, Three.js 공식 예제와 R3F 커뮤니티에서 표준화된 방식. 레이어를 따로 만들 필요 없이 **머티리얼 emissive 값만으로** 어떤 오브젝트가 빛날지 제어.

**상태 전이**:
```
idle:    emissiveIntensity = 0.0,  emissive = #ffffff
guard:   emissiveIntensity = 1.5,  emissive = #4ea8ff  (Switch Sports의 블루 가드 글로우 매칭)
charge:  emissiveIntensity = 2.5,  emissive = #66e5ff  (더 강한 사이언)
swing:   짧은 시간(80-120ms) intensity 스파이크
```

**참고**: R3F 공식 [Bloom 문서](https://react-postprocessing.docs.pmnd.rs/effects/bloom).

### 3.2 검 스윙 트레일 (P0)

**목표**: 마우스로 검을 빠르게 휘두를 때 짧은 잔상 라인으로 모션 가시화.

**구현 방식 (권장)**: `meshline` (pmndrs 메인테이너)

```
1. 검 끝(tip) 월드 좌표를 매 프레임 큐에 push (최대 20-30개)
2. 일정 시간 지난 점 자동 제거 (0.3-0.5초 fade)
3. <meshLineGeometry points={tipHistory} />
4. <meshLineMaterial 
     color={swordColor}
     lineWidth={0.05}
     transparent opacity={fadeOpacity}
     dashArray={0} />
5. widthCallback으로 끝쪽이 가늘어지게(taper)
```

검 색상이 가드 글로우와 동일하면 일관된 시각 언어. 트레일도 emissive면 selective bloom에 자동 합류.

대안: drei의 `<Trail>` 컴포넌트가 더 간단 — 먼저 prototype 시 시도.

### 3.3 임팩트 이펙트: BLOCK vs HIT 시각 구분 (P0)

이미 `?demo=arena`에 **파란 링(BLOCK) / 빨간 링(HIT)** 피드백이 있음 (`docs/prototypes.md` §3). 이를 보강:

| 이벤트 | 시각 |
|---|---|
| BLOCK | 파란 원형 충격파(ring expand + fade), 검 부딪힘 위치에서 발생, 작은 sparks 입자 5-10개 |
| HIT | 빨간 충격파 + 피격자 빠른 넉백 트윈 + 카메라 셰이크 0.1초 |
| Stun(블록 후) | 피격자(공격자였던 쪽) 검이 잠시 떨림 + 작은 별 표시(?) — 옵션 |

**구현**: 단순 `<mesh>` + 셰이더 또는 `THREE.RingGeometry` 애니메이션. drei `<Sparkles>` 컴포넌트를 입자로 활용 가능.

**카메라 셰이크**: `useFrame` 안에서 카메라 위치에 작은 perturbation 추가, 시간감쇠.

### 3.4 콜로세움 발판 + 물 (P0)

**발판**:
- 원형 디스크 (`<cylinderGeometry args={[radius, radius, height, 64]}>`)
- 두 단계 (외곽 링 + 중앙 원) — 서든데스 전환 시 외곽만 가라앉음
- 머티리얼: 토온 + 아주 약한 텍스처(노이즈) 또는 단색

**물 셰이더 (스타일라이즈드)**:

권장: `thaslle/stylized-water` (R3F 전용 카툰 물 셰이더)

특징:
- 단순한 바다 노이즈 + foam 라인
- 모바일/저사양 호환
- Three.js의 무거운 ocean shader보다 가볍고 톤에 맞음

대안: Codrops의 [Stylized Water Effects with R3F 튜토리얼](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/)에 Perlin noise + smoothStep + sine 기반 커스텀 구현 가이드.

**파라미터 권장**:
```
물 색: #2eb8c8 ~ #3ad8e8 (터쿼이즈 톤)
파동 속도: slow (0.2-0.4)
foam threshold: 발판 가장자리에서 강하게
```

**KO 시 splash**: 캐릭터가 물에 닿는 순간 동심원 파동(`RingGeometry` 펄스) + 입자 splash + 카메라 잠깐 lookAt.

### 3.5 셀셰이딩(Toon) 머티리얼 (P1)

**목표**: 전체 게임 룩을 카툰/토이 톤으로 통일.

```
material = THREE.MeshToonMaterial({
  color: baseColor,
  gradientMap: customGradientTexture
})
gradientMap.minFilter = THREE.NearestFilter
gradientMap.magFilter = THREE.NearestFilter
```

**gradientMap**: 1×N 픽셀 텍스처(보통 2-4단계 그레이). NearestFilter로 단계가 뚜렷하게 나옴.

**적용 대상**:
- 캐릭터 (Soldier.glb / Quaternius / Tripo3D 모델 모두 머티리얼 교체 가능)
- 발판 / 환경

**검은 toon이 아니라 emissive + bloom**으로 가는 게 발광 효과와 자연스럽게 분리됨.

### 3.6 카메라 (P0 → P1)

**P0 (단순)**:
- 고정 카메라, 두 캐릭터 가운데를 lookAt, 살짝 위에서 비스듬히 (Switch Sports와 유사한 사이드뷰)
- `<PerspectiveCamera position={[0, 3, 8]} fov={45}>` 정도

**P1 (시네마틱)**:
- KO 순간 짧은 줌인/추격
- 임팩트 시 작은 셰이크
- 라운드 시작/종료 시 짧은 휩 팬

drei의 `<CameraControls>` 또는 직접 `useFrame` 보간.

### 3.7 HUD / UI (P0)

**현재 상태**: `?demo=arena`에 좌상단 카운터 + 슬라이더 (`docs/prototypes.md`).

**잼 출품용 권장**:
```
상단 중앙: 라운드 타이머 (큰 숫자)
좌상단: 플레이어 1 이름 + 라운드 깃발(○ ● ○)
우상단: 플레이어 2 이름 + 라운드 깃발
하단 중앙(차지 검 도입 시): 차지 게이지
```

CSS는 `tech-stack.md`에 따라 손으로 작성 (Tailwind 미사용). HUD는 React 컴포넌트로 R3F Canvas 외부에 절대 위치.

폰트 추천: 둥근 산세리프(Quicksand, Nunito) 또는 게임 픽셀 톤(Press Start 2P)이 잼 톤과 어울림.

---

## 4. 라이브러리 / 의존성 추가 권장

기존 `tech-stack.md`의 "추가될 가능성이 있는 의존성" 표에 이미 후보가 있음. 시각 작업에 도입할 패키지:

| 패키지 | 용도 | 우선순위 | 번들 영향 |
|---|---|---|---|
| `@react-three/postprocessing` | Selective bloom (검 글로우) | **P0** | 중 (~30KB gz) |
| `meshline` | 검 트레일 | **P0** | 소 (~5KB gz) |
| (또는 drei `<Trail>`) | 트레일 더 간단 버전 | P0 대안 | 이미 drei 안에 |
| `three-stdlib` | OrbitControls 등 표준 | 옵션 | 소 |
| `leva` | 디버그 GUI (이펙트 튜닝) | 개발 중 P1 | 개발 의존성으로 |

**비도입 권장**:
- `@react-three/rapier` — Chambara에선 물리 충돌 불필요. KO 판정은 거리/위치로 충분.
- `howler` — 사운드는 별도 단계 (이번 보고서 범위 외).

번들 사이즈 (`game-design.md` §6.4: 현재 1.1MB / gzip 311KB) 관점에서 P0 패키지 추가 후 ~350KB gz 정도로 예상 — 잼 기준 충분히 빠름.

---

## 5. 에셋 파이프라인

### 5.1 검 모델

- 단순한 박스 + GLB 둘 다 시도 가능. **단순 박스가 잼 일정에 더 안전** (커스텀 GLB 부담).
- 검신 / 가드(손잡이 보호) / 그립 3 파트로 mesh 분리 → 검신만 emissive 적용 가능.

### 5.2 캐릭터 모델

`docs/game-design.md` §6에서 미정. 시각 톤별 추천:

| 시각 톤 | 캐릭터 권장 |
|---|---|
| **라이트세이버 SF** | Tripo3D로 SF 전사 5-10명 사전 풀 / Quaternius Sci-Fi 로우폴리 |
| 추상 미니멀 | 단순 도형(캡슐+원기둥) — 별도 에셋 불필요, 잼 스타일 |
| 사무라이 원작 카피 | Tripo3D 사무라이 / 위험: IP 카피 인상 |

**Soldier.glb (현재 데모용)**는 잼 출품에 무거움 (2.1MB) — 잼 빌드에서는 더 가벼운 모델로 교체.

### 5.3 환경

- 발판: 코드 생성(`<cylinderGeometry>`) — 에셋 불필요
- 물: 셰이더 (별도 에셋 불필요)
- 하늘: drei `<Sky>` 또는 단순 그라디언트 셰이더
- 콜로세움 장식 (옵션, P2): Quaternius 환경 키트 또는 단순 박스 컬럼

---

## 6. 기존 프로토타입 → 잼 빌드 발전 경로

`docs/prototypes.md`의 데모 라우트와 결합:

```
[ 현재 ]                            [ 시각 보강 후 ]
?demo=character (Soldier.glb)   →   라이트세이버 캐릭터 + 토온 머티리얼
?demo=sword (각도 입력 검증)     →   emissive 검 + 트레일 + 가드 블루 글로우
?demo=arena (직각 블록 판정)     →   콜로세움 발판 + 물 + 임팩트 링/셰이크
?demo=stage (미구현, 좁은 발판)  →   서든데스 전환 + KO splash
```

각 단계는 독립적으로 P0 머티리얼/이펙트만 교체하면 되므로 **점진적 적용 가능**.

---

## 7. 권장 작업 순서 (잼 일정 가정)

| 순서 | 작업 | 예상 시간 | 결과 |
|---|---|---|---|
| 1 | `@react-three/postprocessing` 도입 + Bloom 설정 | 0.5h | 검 발광 작동 |
| 2 | 검 머티리얼 emissive 상태 전이 (idle/guard/charge) | 1h | 가드 시 검 파랗게 빛남 |
| 3 | 검 트레일 (drei `<Trail>` 또는 meshline) | 1-2h | 스윙 모션 시각화 |
| 4 | 임팩트 링/셰이크 강화 (현재 ?demo=arena 보강) | 1-2h | BLOCK/HIT 시각 명료 |
| 5 | 콜로세움 발판 + stylized water | 2-3h | 스테이지 분위기 완성 |
| 6 | KO splash + 낙하 애니메이션 | 1-2h | 매치 종결 시각 |
| 7 | (옵션) 토온 머티리얼 적용 | 1h | 톤 통일 |
| 8 | (옵션) 카메라 임팩트 셰이크/줌 | 1h | 클립 가치 향상 |
| 9 | (옵션) 서든데스 외곽 링 가라앉기 | 2h | 매치 후반 연출 |

P0 만 합쳐 ~6-10시간이면 시각 시그니처 완성.

---

## 8. 검증 / 다음 단계

본 리서치는 보고서 단계까지가 범위. 사용자가 결정할 다음 단계:

1. **테마 결정**: 라이트세이버 / 미니멀 / 사무라이 / 메타 중 — `game-design.md` §6 미결정 확정
2. **`/sc:design`**: 시각 컴포넌트 구조 설계 (어디에 EffectComposer를 둘지, 검 컴포넌트 인터페이스 등)
3. **`/sc:implement`**: P0 항목부터 단계별 구현
4. **추가 리서치 필요 시**: 실제 챔버라 게임플레이 영상 프레임 분석(Tavily extract + 직접 시청)으로 정확한 색 코드 / 타이밍 추출

---

## 9. Sources / 참고

### 원작 챔버라 비주얼
- [Chambara | Switch Sports Wiki | Fandom](https://switchsports.fandom.com/wiki/Chambara) — 검 글로우, 콜로세움 구조
- [Chambara Controls and Tips | Game8](https://game8.co/games/Nintendo-Switch-Sports/archives/376158) — 가드 시 파란 글로우 명시
- [Beginner Basics for Nintendo Switch Sports | Nintendo Japan](https://www.nintendo.com/jp/ichikara/as8sa/02_en.html) — 공식 비주얼 안내
- [Sportsmate | Switch Sports Wiki](https://switchsports.fandom.com/wiki/Sportsmate) — 캐릭터 디자인 철학

### R3F / Three.js 시각 구현
- [Bloom — React Postprocessing](https://react-postprocessing.docs.pmnd.rs/effects/bloom) — Selective bloom 표준 패턴
- [Three.js webgl postprocessing unreal bloom selective](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html) — 공식 예제
- [pmndrs/meshline (GitHub)](https://github.com/pmndrs/meshline) — 검 트레일용
- [r3f ⚡ simple trail (CodeSandbox)](https://codesandbox.io/s/r3f-simple-trail-5nsp3) — 트레일 작동 예제
- [Creating Stylized Water Effects with R3F | Codrops](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/)
- [thaslle/stylized-water (GitHub)](https://github.com/thaslle/stylized-water) — 카툰 물 셰이더
- [MeshToonMaterial — three.js docs](https://threejs.org/docs/pages/MeshToonMaterial.html) — 셀셰이딩
- [Water Shader — Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/water-shader)

### 프로젝트 내부 문서
- `docs/tech-stack.md` — 기술 스택 결정
- `docs/architecture.md` — 모노레포 구조
- `docs/game-design.md` — 게임 메카닉 + 미결정 항목
- `docs/prototypes.md` — 현재 동작하는 데모 라우트
- `claudedocs/research_chambara_20260428.md` — 원작 메커니즘 분석(선행 리서치)

---

## Appendix A: 영상 직접 분석의 한계

요청된 영상(`https://www.nintendo.com/kr/switch/as8sa/assets/mov/chambara_point01.mp4`)은 **mp4 바이너리**라 WebFetch 도구로 직접 분석 불가(10MB 초과 + AI 텍스트 처리 도구의 입력 형식 불일치). 본 보고서의 시각 분석은 다음을 종합:

- 영상이 게재된 페이지의 텍스트 컨텍스트
- Switch Sports Wiki / Game8 / Nintendo 공식 가이드의 텍스트 묘사
- 일반화된 "검도풍 의상", "콜로세움 + 물", "검 가드 시 블루 글로우" 등의 명시 정보

**더 정밀한 분석이 필요하면**:
1. 영상을 로컬에 다운로드 후 `ffmpeg -i input.mp4 -vf "fps=2" frame_%03d.png`로 프레임 추출
2. 추출된 PNG를 Read 도구로 1장씩 분석 (Claude는 이미지 인식 가능)
3. 색 코드 / UI 위치 / 이펙트 타이밍 정밀 측정

이 단계는 시각 톤이 라이트세이버/미니멀로 결정되면 **불필요할 수 있음**(원작 톤 모방이 목표가 아니므로). 사무라이 원작 카피 톤을 선택하면 권장.

---

## Appendix B: 신뢰도 / 정보 격차

| 항목 | 신뢰도 | 비고 |
|---|---|---|
| 검 가드 시 블루 글로우 | High | 다수 가이드 일치 |
| 콜로세움 원형 발판 + 물 | High | 공식 + 위키 |
| 서든데스 외곽 링 가라앉기 | High | 다수 가이드 |
| 트윈 소드 풀차지 발광 | High | Game8 명시 |
| 캐릭터 정확한 컬러 팔레트 | Medium | 일반적 묘사만, 정확한 hex 코드 비공개 |
| 카메라 정확한 FOV/거리 | Low | 영상 직접 분석 필요 |
| 검 트레일 정확한 길이/색 | Low | 영상 분석 필요 |
| HUD 폰트/배치 정확 픽셀 | Low | 영상 분석 필요 |

대부분의 정밀 수치(색 hex, 카메라 FOV, 폰트 등)는 잼 출품작의 **시각 톤이 우리 결정에 따라 달라지므로** 원작 정확 매칭이 핵심 요구사항이 아님. 톤이 결정되면 그에 맞는 자체 색 팔레트를 디자인하는 게 더 적합.

---

**End of Visuals Research Report**
