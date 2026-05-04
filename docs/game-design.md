# Game Design — Chambara Duel

> 마지막 업데이트: 2026-05-01 잼 마감 당일
>
> Vibe Jam 2026 출품작 컨셉 + 입력 모델 + 판정 규칙 + 프로토타입 정리.
> 이 문서는 살아있는 디자인 로그 — 결정이 바뀌면 갱신.
> **현재 빌드 상태는 `docs/duel-implementation.md`(Phase 18까지 반영)** 참고.

## 1. 컨셉 한 줄

**1대1 칼싸움 듀얼.** Nintendo Switch Sports의 *Chambara* 종목을 웹/모바일로 포팅한 변형. 마우스로 검 각도를 직접 조작, 두 검이 직각에 가까울 때만 막힘. 기본 라운드 30-60초.

> **플랫폼 우선순위 (2026-04-29 결정)**:
> - **PC를 1차 타겟으로 구현**. 게임플레이는 **마우스 전용** (키보드 미사용). 좌클릭 슬라이스 / 휠클릭·더블 클릭 찌르기 / 우클릭 가드.
> - 모바일(터치/자이로)은 잼 마감 전 시간 남으면 추가하는 P2 폴리시. 잼 핵심 평가 항목(30초 룰·사설방·랭크)은 PC에서 먼저 완성.
> - 모바일 입력 모델은 §3.2/§3.3 설계 그대로 두되 메인 게임 구현은 미루는 정책. `?demo=sword`에서 자이로/터치 검증 가능.

> 향후 추가 가능: 물 위 좁은 발판(Switch Sports Chambara 원작), 토너먼트 모드, AI 부족장 같은 메타 테마. 핵심 판정 메카닉은 동일하게 유지.

## 2. 왜 이 컨셉인가

`docs/submitted-games.md` 의 화이트스페이스 분석을 만족:

| 잼 평가축 | 매칭 |
| --- | --- |
| 30초 룰 | 두 캐릭터 + 검 + 직각 매칭 = 한 컷에 의도 보임 |
| 인터넷 미존재 | 챔버라 웹 포트가 없는 게 화제성 그 자체 |
| 멀티 인원 | 1v1 = 동접 2명만 있어도 게임 성립 + AI 봇 폴백 |
| 모바일 호환 | 터치/자이로 입력 자연스럽게 매핑 |
| 클립 가치 | 한 합 끝나는 순간이 드라마, 트윗 직격 |
| 레드오션 회피 | FPS·비행·드리프트·OHOL 클론 어디에도 안 걸림 |
| 깊이 | 단순한 입력에 가위바위보 + 마인드게임 |

수상작 3편(Taxi Assignment / Vibeware / Vector Tango) 공통점인 "친숙한 IP 기억에 의존" 도 충족 — Switch Sports 를 알면 30초 안에 룰 이해.

## 3. 핵심 메카닉

### 3.1 차단 판정 — 직각 규칙

두 검은 방향성 없는 선분이라, 두 선이 이루는 각도는 [0°, 90°] 범위.

```
diff_rad = (player_angle − attacker_angle) mod π   // [0, π)
line_angle = min(diff_rad, π − diff_rad)            // [0, π/2]

|line_angle − π/2| < tolerance  →  BLOCK
                                →  HIT
```

직관: 두 칼이 **평행**이면 미끄러짐 → HIT. **직각에 가까우면** 충돌해서 막힘 → BLOCK.

#### 예시

공격이 좌상단(135°)에서 우하단(315°)으로 수평에 가까운 사선 휘두름. 임팩트 순간 공격자 검이 수평(0°)에 가깝다면:

| 방어자 검 각도 | line_angle | block? |
| --- | --- | --- |
| 좌상단 (135°) | 45° | ❌ HIT — 거의 평행 |
| 수직 (90°) | 90° | ✅ BLOCK |
| 우상단 (45°) | 45° | ❌ HIT |
| 수평 (0° / 180°) | 0° | ❌ HIT — 완전 평행 |

#### 허용폭 (tolerance)

기본 25°. 슬라이더로 5-45° 실시간 조정 가능. 베타 단계에서 25-35° 사이 튜닝 예상.

### 3.2 입력 모델

| 디바이스/모드 | 검 각도 입력 | 가드 트리거 |
| --- | --- | --- |
| 데스크톱 (마우스) | 마우스 위치 (상시) | **마우스 클릭+홀드** |
| 모바일 자이로 | 폰 좌우 기울기 (gamma) | **화면 어디든 탭+홀드** |
| 모바일 터치 | 첫 손가락 드래그 위치 | **두 번째 손가락 (어디든)** |

#### 왜 이 매핑

- **데스크톱**: 마우스가 항상 화면에 있어 "수동적 호버 = 자유 휘두름", "능동적 클릭 = 가드" 가 자연스럽게 분리
- **모바일 자이로**: 폰이 검 그 자체. 한 손은 폰 잡기, 다른 손 엄지로 화면 탭 가드. 폰 던질 위험 ↓ (탭이 명시적 입력)
- **모바일 터치**: 한 손가락은 검 조작 전용, 두 번째 손가락은 가드. 자동 정지 감지 같은 모호한 트리거 회피

#### 자동 정지 감지(auto-stillness) 폐기 이유

초기에 "모바일 터치 모드에서 손가락 정지 200ms = 가드" 자동 감지를 시도. 사용자 피드백 — **명시적 입력이 더 명확.** 정지 감지는 검을 천천히 위치 조정할 때 의도치 않은 가드를 유발.

### 3.3 폰 자이로 — 무엇이 추적되고 무엇이 안 되는가

| 추적 대상 | 가능? | 비고 |
| --- | --- | --- |
| 회전 (orientation) | ✅ DeviceOrientation API | gamma 축으로 검 각도 매핑 |
| 가속도 (motion) | ✅ DeviceMotion API | 휘두름 스파이크 감지 |
| 절대 3D 위치 | ❌ 표준 센서로 불가 | 가속도 이중 적분은 1-2초에 드리프트 |
| WebXR 6DoF | ⚠️ 부분 가능 | 카메라 SLAM 필요, 무거움 |

**핵심**: Switch Joy-Con 도 절대 위치는 추적하지 않음. Chambara에서 "정 중앙" 은 **현재 자이로 상태를 기준점으로 리셋하는 소프트웨어 트릭**. 폰도 동일 방식 (`Recenter` 버튼). 폰 위치 트래킹 없이도 게임 성립.

#### iOS 권한 / HTTPS

- iOS Safari 13+: `DeviceOrientationEvent.requestPermission()` 필수, 사용자 탭 이벤트 안에서 호출
- iOS Safari: HTTPS 필수 (LAN 의 자체 서명 인증서로 OK, 한번 통과 후 동작)
- 권한 거부 시 자동 터치 모드 유지 + 안내 메시지

`yarn dev:client:https` 로 LAN HTTPS 서빙 (`@vitejs/plugin-basic-ssl`).

## 4. 컨셉 반복 기록

### 폐기된 후보들

| 후보 | 폐기 이유 |
| --- | --- |
| **3D 비행기 멀티 슈터** (초기 스캐폴드) | fly.pieter 클론 = 출품 비중 15%+ 레드오션. 스캐폴드 코드는 R3F/Colyseus 검증용으로만 유지 |
| **One Hour One Life + 부족 전쟁** | 부족 전쟁이 의미를 가지려면 동접 20-40명 필요. 잼 평균 동접으론 불가. AI 부족 시뮬은 잼 일정에 너무 큼 |
| **실제 트럼프 암살 시도 모티브 잠입 액션** | 현직 국가원수 + 실제 사망자 발생 사건. 정치 폭력 정상화 우려 + 잼 1차 컷 위험 → 가상 인물 / 역사적 인물 / 비정치 무대 등으로 redirect 가능했지만 채택 안 함 |
| **Super Mario Party Jamboree 검도 종목** | 사용자가 잘못 기억한 레퍼런스 — 실제로는 그 게임에 그런 모드 없음 |
| **1-2-Switch Samurai Training** | 사용자가 잘못 기억 — 정지 → 한 박자 일격 패턴, 우리 컨셉과 다름 |
| **Switch Sports Chambara** ✅ | **현 채택.** 1v1 + 직각 가드 + 발판 낙하 + 모바일 자이로 자연 매핑 |

### 입력 디자인 반복

1. (초안) **자유 격투 / 발판 밀어내기 (Bumper Balls 류)** — 깊이 있지만 컨트롤 튜닝 시간 큼
2. (초안) **타이밍 한 방 (거합 류, 1-2-Switch)** — 너무 단순, 운빨
3. **Chambara 각도 매칭** — 채택. 깊이와 단순함의 중간
4. (초안) **블레이드 평행 = 막힘** — 잘못된 물리 직관, 수정됨
5. **블레이드 직각 = 막힘** — 채택, 실제 검술 일치
6. (초안) **자동 정지 감지로 가드** — 모호함, 폐기
7. **명시적 클릭/탭/2-finger 가드** — 채택

## 5. 프로토타입 (구축 완료, dev 서버에서 동작)

`yarn dev:client` (HTTP) 또는 `yarn dev:client:https` (HTTPS, iOS 자이로용).

| URL | 검증 목적 |
| --- | --- |
| `/?demo=character` | Three.js로 인간 캐릭터 렌더링 가능 검증 (Soldier.glb 2.1MB 풀바디 리깅 + 애니메이션) |
| `/?demo=sword` | 검 각도 입력 모델 검증 (touch/gyro 모드, 가드 토글) |
| `/?demo=arena` | 직각 블록 판정 + 점수 + 슬라이더 튜닝 |
| `/` | (스캐폴드) 비행기 멀티 — 컨셉 폐기, R3F+Colyseus 동작 확인용 |

상세는 `docs/prototypes.md` 참고.

## 6. 미결정 (다음 단계)

### 게임 디자인
- [x] **테마 / 톤**: **SF 라이트세이버 + 사이파이 인더스트리얼 챔버** (2026-04-29 결정 → Phase 16에서 콜로세움 → 사이파이 챔버 + 사이버펑크 스카이라인으로 재테마). 검 글로우는 시안/마젠타 코어 + 화이트 HDR, Bloom selective로 발광.
- [x] **캐릭터 소스**: xbot/ybot Mixamo 리깅(Phase 14) — Mii prim placeholder 폐기. Phase 18에서 슬래시 8방향 클립 + 전용 Stun reaction.
- [x] **스테이지**: 좁은 발판 + 가시 함정 pit (Phase 16, Water 폐기). `ARENA_RADIUS=4.0`, 사이파이 인더스트리얼 챔버 톤.
- [x] **승패 조건**: 발판 밖 낙하(ringout) + 시간 제한 45s + Bo3 라운드 (Phase 8/16).
- [x] **공격 시스템**: 가드 매칭(직각 ±45°) + 카운터 윈도우 + thrust block stun (Phase 7). 페이크는 미구현(P2).
- [x] **공격 각도 풀**: Phase 18부터 슬래시 8방향 클립 + 시작점 방향 매핑(45°/225°는 무기별 oneHand/twoHands variant).
- [x] **카메라 앵글**: 캐릭터 바로 뒤 (X=0 중앙) + 살짝 위에서 내려다보는 3rd-person — Switch Sports 챔버라 예시 이미지 매칭. 시야 확보는 player `transparentWhenIdle` (32% opacity)으로 해결.

### 튜닝 (`?demo=arena` 슬라이더로 결정)
- [ ] **Tolerance**: 현재 25°, 베타 25-35°
- [ ] **Telegraph**: 현재 800ms, 빠른 반사 vs 여유 게임
- [ ] **Idle**: 현재 1500ms

### 멀티플레이
- [x] AI 봇 (단독 플레이) — 메인 모드. Phase 18부터 봇 가드가 PI/4 snap 폐기 + 연속 각도 + critical-damped 스무딩으로 자연화.
- [x] **랭크 1v1 자동 매치메이킹**: Cloudflare Workers + Durable Objects. `RankedQueue` DO ±200 범위 매칭, `DuelRoom` DO shared resolver 서버 권위. ELO K=32 + `Leaderboard` DO Top 20 (Phase 11a/11c).
- [x] **사설방 코드 생성/입장**: `/rooms/private-{code}` 직접 WS 연결, `record=0`으로 leaderboard/local rating에 반영 X (Phase 11e).
- [ ] **자동 토너먼트 4/8/16인 (P2)**: UI는 비활성. 승자 집계/브래킷 진행 DO 미구현.
- [x] 옵저버 측 검 끝/가드 보간 (Phase 16 `blade-tip-predictor` + Phase 18 facing-flip 미러링).

### 컴플라이언스 / 마무리
- [x] vibej.am 위젯 동작 확인 (현재 index.html 에 삽입)
- [x] **자체 도메인 호스팅**: Cloudflare Pages(client) + Cloudflare Workers/Durable Objects(worker). Phase 13 라이브 배포 완료.
- [x] **즉시 로딩**: Pages TTFB 71ms / Total 81ms, JS 번들 gzip 388KB (2026-04-29 측정).
- [ ] 모바일 동작 검증 (iOS Safari 자이로/터치) — P2
- [ ] AI 코드 비율 ≥ 90% 유지 — 잼 마감 직전 검증
- [ ] 두 창 라이브 매칭 smoke test (Solo/Ranked → queue → match → state → impact → matchOver → leaderboard)

## 6.1 잼 일정 (마감 2026-05-01 13:37 UTC)

**플랫폼**: PC 우선 (마우스 전용). 모바일은 시간 남으면 P2.

**Day 1 (시각 P0)** — Phase 7-8 (2026-04-29) ✅ 완료:
1. 카메라 앵글 (Phase 7)
2. postprocessing + Bloom + ACES 톤매핑
3. 검 emissive HDR (라이트세이버 톤, 시안/마젠타 코어)
4. 검 트레일 (drei `<Trail>`)
5. 임팩트 링/셰이크 (BLOCK/HIT/PIERCE 시각화) + KO splash
6. 4-tier 외곽 링 + 발광 페리미터
7. Stylized water shader (이후 Phase 16에서 가시 함정으로 교체)

**Day 2 (멀티 + 배포)** — Phase 11/13 (2026-04-29) ✅ 완료:
1. Cloudflare `RankedQueue` Durable Object — ELO ±200 자동 매치메이킹 (Phase 11a + 11.6)
2. Cloudflare `DuelRoom` Durable Object — shared resolver 서버 권위, 30Hz state broadcast (Phase 11a)
3. ELO K=32 + `Leaderboard` DO + Cloudflare Pages 배포 + GitHub Actions CI/CD (Phase 11c/13)

**Day 2 추가 폴리시** — Phase 15-18 (2026-04-30 ~ 2026-05-01) ✅ 완료:
1. 애니메이션 시스템 확장 (Phase 15: clip timeScale + hit 분리 + 가드 lean)
2. 다중 무기·캐릭터 + 사이파이 챔버 + 옵저버 보간 (Phase 16, 15+ commits)
3. 오디오 통합 — Howler 21 SFX + 4 BGM + reactive saber hum (Phase 17)
4. **D-day 최종 튠** — 8방향 슬래시, root motion 댐핑, 봇 가드 스무딩, 옵저버 미러링, spawn 거리 ±1.5, 넉백 0.75× (Phase 18)

**잔여 잼 마감 작업**: AI 코드 비율 검증, 두 창 라이브 매칭 smoke test, 컴플라이언스 체크리스트 (`docs/vibe-jam.md` §8).

**P2 폴리시 (잼 후)**: 자동 토너먼트, 모바일 자이로/터치, AI 시드 RNG, footstep SFX, 사전-KO 슬로모 활성화 튜닝.

## 7. 화이트스페이스 결합 가능성

`docs/submitted-games.md` 분석의 화이트스페이스 6개 중 본 컨셉이 결합 가능한 것:

- ✅ **Tripo3D 활용** — 캐릭터 5-10명 사전 풀 또는 "단어 → 적 캐릭터" 시그니처 메카닉
- ✅ **모바일 가산점** — 자이로 모드 자체가 모바일 우선
- ⚪ **메타 게임** — 테마를 "AI 면접관과 결투" 같이 가져갈 수 있음
- ⚪ **포털 메카닉** — 발판 가장자리에 포털 = 다른 #vibejam 게임으로 전환
- ❌ **로컬 비대칭** — Chambara는 같은 화면 1v1 이라 적용 어려움
- ❌ **리듬 게임** — 별 메카닉

## 8. 참조

- [`docs/vibe-jam.md`](./vibe-jam.md) — 잼 규칙·일정·심사 기준
- [`docs/submitted-games.md`](./submitted-games.md) — 출품작 분석·화이트스페이스
- [`docs/fly-pieter-research.md`](./fly-pieter-research.md) — 잼 시발점인 fly.pieter.com 패턴
- [`docs/tripo3d.md`](./tripo3d.md) — 캐릭터 에셋 생성 활용 가이드
- [`docs/prototypes.md`](./prototypes.md) — 데모 라우트별 사용법
- [`docs/architecture.md`](./architecture.md) — 시스템 아키텍처
- [`docs/setup.md`](./setup.md) — 개발 환경 셋업
