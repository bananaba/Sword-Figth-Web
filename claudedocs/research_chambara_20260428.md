# Nintendo Switch Sports Chambara — 게임 메커니즘 리서치 리포트

> **목적**: PC/모바일 플랫폼으로 챔버라(검술) 게임을 구현하기 위한 사전 조사
> **작성일**: 2026-04-28
> **리서치 모드**: Standard (2-3 hop, structured report)
> **출력 정책**: 본 문서는 리서치 보고서이며 구현 코드는 포함하지 않음

---

## Executive Summary

Nintendo Switch Sports의 **Chambara(챔버라/검술)**는 두 명의 플레이어가 칼로 서로를 공격하여 원형 플랫폼 밖 물속으로 떨어뜨리는 1대1 격투 스포츠다. 핵심 메커니즘은 **3방향(수직/수평/대각) 스냅 기반의 검 각도 시스템**, **"가드는 공격 방향과 수직(perpendicular)이어야 성공"**, **"공격은 상대 가드 방향과 평행(parallel)이어야 관통"**이라는 가위바위보형 상호작용에 있다.

세 가지 검(기본/차지/쌍검)은 각기 다른 차징·보너스 메커니즘을 갖고, 베스트 오브 3 라운드(라운드당 45초), 4라운드는 서든데스(중앙 플랫폼만 남고 2히트 KO)로 구성된다.

**PC/모바일 이식 핵심 과제**:
1. 모션 입력(스윙 방향/속도/관성)을 **마우스 델타·터치 스와이프·자이로**로 매핑
2. **3방향 스냅 + 가드 각도 매칭**이라는 추상적 레이어를 보존하면서 입력 디바이스에 종속되지 않도록 설계
3. **타이밍 판정(Timely Block, 차지 게이지)**의 프레임 단위 일관성을 네트워크 멀티플레이까지 고려해 보존

신뢰도: **High** (Nintendo 공식 페이지, 공식 개발자 팁, 위키, 대형 가이드 사이트 다수 교차 검증)

---

## 1. 게임 개요

| 항목 | 내용 |
|---|---|
| 장르 | 2인 1대1 검술 격투 스포츠 |
| 승리 조건 | 상대를 플랫폼 밖(물)으로 떨어뜨리기 |
| 매치 형식 | Best of 3 라운드 (먼저 2승) |
| 라운드 시간 | 45초 |
| 동점 처리 | 4라운드 서든데스 (작은 중앙 플랫폼, **2히트면 KO**) |
| 무기 종류 | Sword / Charge Sword / Twin Swords (3종) |

**스테이지**: 물 위에 떠 있는 원형 콜로세움형 플랫폼. 일반 라운드에서는 가장자리에 떨어지면 즉시 KO. 서든데스에서는 외곽 링이 물에 잠기고 중앙 작은 원만 남는다.

---

## 2. 핵심 전투 메커니즘

### 2.1 입력 → 행동 매핑 (Joy-Con 기준)

| 행동 | 입력 |
|---|---|
| 슬라이스 공격 | Joy-Con을 한 방향으로 휘두르기 |
| 찌르기(Thrust) | Joy-Con을 앞으로 빠르게 내밀기. 슬라이스보다 **넉백 강함** |
| 가드 | **ZL/ZR 버튼 홀드**. 손목 기울기로 가드 각도 조정 |
| 검 각도 | **수직 ↕ / 수평 ↔ / 대각A ↗↙ / 대각B ↘↖** 4축으로 자동 스냅 (Wii Sports Resort보다 단순화) |
| 공격 강도 | 휘두르는 속도/제어. **느리고 정확한 스윙이 더 강함**. 마구잡이 휘두르면 약해짐 |
| 검 위치 | **무시됨** — 게임은 스윙의 방향(direction) 벡터만 보고, 신체 어느 쪽에서 휘둘렀는지(우상→우하 등 측면 베기)는 검출 안 함. 모두 동일한 "수직 공격"으로 처리 |
| 페이크/Tell | 검의 정지 위치는 **약한 시각 단서일 뿐**, 게임 룰에 영향 없음. 검을 좌상단에 들고 있어도 스윙 방향에 따라 수직/수평/대각 어느 공격이든 발동 가능 → 페이크 플레이의 근거 |

### 2.2 공격 vs 가드 상호작용 (게임의 핵심 룰)

**슬라이스(Slice) 공격의 경우**:

```
규칙 1 (가드 성공): 가드의 방향이 상대 슬라이스 방향과 PERPENDICULAR(수직)일 때
                  → 공격자 STUN, 가드한 쪽이 카운터 윈도우 획득

규칙 2 (가드 관통): 슬라이스가 상대 가드 방향과 PARALLEL(평행)일 때
                  → 가드 무시, 데미지/넉백 적중

예시:
- 상대가 ↕(수직)으로 가드 → 나도 ↕로 공격하면 관통
- 상대가 ↔(수평)으로 가드 → 나도 ↔로 공격하면 관통
- 상대가 ↕로 가드 → 내가 ↔로 공격 → 가드 성공, 내가 STUN
```

이것이 **본질적으로 가위바위보 미니게임**이며, "상대의 가드 각도를 읽고 같은 방향으로 휘두를지 / 다른 방향으로 휘둘러 함정을 팔지" 결정하는 mind game이 핵심 재미.

**찌르기(Thrust) 공격은 다른 리스크/리워드 구조 (중요)**:

```
규칙 3: 찌르기는 가드 방향과 무관하게 ANY 방향 가드에 모두 막힘
        → 슬라이스의 방향 mind game이 통하지 않음
        → 단, 명중 시 슬라이스보다 큰 넉백 보상
```

즉 찌르기는 **하이리스크-하이리워드 베팅 카드**:

| 측면 | 슬라이스 | 찌르기 |
|---|---|---|
| 리워드 | 보통 넉백 | **큰 넉백** |
| 가드당할 때 | ⊥면 상대 STUN(이득), ∥이면 관통 → 50/50 mind game | **모든 가드에 막힘 → 무조건 손해** |
| 플레이어가 읽어야 할 것 | 상대 가드 **각도** | 상대가 **가드 중인지 / 가드를 들 수 있는 상황인지** |

**찌르기를 쓰기 좋은 상황**:
- 슬라이스를 ⊥로 가드 → 상대 STUN 윈도우 (대표적 콤보)
- 상대가 가드를 풀고 공격 모션에 들어간 직후 빈틈
- 차지 중이거나 자세 전환 중인 빈틈
- 상대가 가드를 절대 들지 못한다고 확신할 때의 결정타

**찌르기가 안 좋은 상황**:
- 상대가 가드를 단단히 들고 있는 일반 교전 → 무조건 막혀서 손해
- 따라서 찌르기를 남발하면 슬라이스보다 더 큰 페널티

격투게임으로 치면 **강공격(heavy attack)/콤보 피니셔**의 포지션 — 모션 길고 가드되면 큰 손해지만 맞으면 보상도 큼.

> 출처: *"The thrust gives a good knockback, but will get blocked by any block regardless of the opponent's sword direction."* (다수 가이드 일치)
> 공식 가이드 표현: *"It has the best effect when you land the thrust after stunning your opponent by guarding against their attack."* — STUN 후가 베스트일 뿐, 그 외 빈틈에도 사용 가능

### 2.3 라운드 종료 조건

- 시간 내 상대를 플랫폼 밖으로 떨어뜨린 쪽이 라운드 승 (1 flag 획득)
- 시간 종료 시 처리 규칙은 명확히 공개되지 않았으나, 일반적으로 위치/잔체력 기반 판정으로 추정 (다수 가이드는 "시간 내 떨어뜨리지 못하면" 케이스를 명시하지 않음)

---

## 3. 검 종류별 차별화 메커니즘

### 3.1 Sword (기본 검) — Joy-Con 1개

- **특징**: 단일 타격 넉백이 가장 강함
- **메커니즘**: 차지/특수기 없음, 순수한 read-and-react 게임
- **추천 대상**: 처음 배우는 플레이어, 정직한 1대1 mind game을 즐기는 플레이어

### 3.2 Charge Sword (차지 검) — Joy-Con 1개

- **특징**: 가드 성공 시 에너지 충전 → Charge Strike / Charge Thrust 발동 가능
- **Timely Block (개발자 팁)**:
  - 상대 공격 **직전(just before)** 가드 버튼을 누르면 "Timely Block" 발동
  - 상대를 **매우 멀리 날려버림**
  - 버튼을 마구 누르면 발동 불가 (정밀 타이밍 필수)
- **메커니즘 비교**: 격투 게임의 패링(parry) / 저스트 가드와 동일한 패턴
- **추천 대상**: 상대 패턴을 읽고 한 방을 노리는 카운터형 플레이어

### 3.3 Twin Swords (쌍검) — **Joy-Con 2개 필요**

- **특징**: 양손에 검 한 자루씩, **각 검을 독립적으로 각도 제어**
  - → 두 가지 다른 각도로 동시 가드 가능 (예: 좌수 ↕, 우수 ↔)
- **차지**: 게이지가 **자동으로** 차오름 (가드 불필요)
- **풀차지 시**: 양손 Joy-Con을 동시에 어떤 방향으로든 휘두르면 **Spinning Strike / Twin Thrust** 발동
- **추천 대상**: 다중 입력에 익숙하고 양방향 가드를 활용하는 고급 플레이어

---

## 4. 개발자 공식 팁 (Nintendo)

1. **"Slow down and land one blow at a time"** — 천천히 정확히 휘두를 것. 무작위로 빠르게 흔들면 공격력이 약해진다 (게임 엔진이 "정확한 스윙 방향 인식 + 강한 임팩트"를 따로 판정한다는 의미).
2. **차지 검 사용자**: Timely Block은 마구 눌러서는 안 된다. 정밀 타이밍이 보상받는 시스템.
3. **블로킹은 항상 홀드 + 각도 조정**: 가드 버튼을 단순히 눌렀다 떼는 게 아니라, 항상 홀드한 상태에서 손목 각도로 방향을 계속 조정해야 함.
4. **상대를 읽는 것이 핵심**: "Wait for a good moment to strike and read your opponent's movement."

---

## 5. PC/모바일 이식을 위한 입력 매핑 설계안

> 본 섹션은 리서치 결과를 바탕으로 한 **설계 옵션 제시**이며 구현 결정은 사용자에게 위임.

### 5.1 입력 추상화 레이어

이 게임의 본질적 입력은 결국 다음 4가지로 추상화된다:

```
1. SwordAngle ∈ {Vertical, Horizontal, DiagonalA, DiagonalB}  (4-way enum, 스윙 모션 방향)
2. Action     ∈ {Slice, Thrust, Idle}
3. Guard      ∈ {Active(angle), Inactive}                      (가드 검의 방향)
4. Power      ∈ [0.0, 1.0]   (스윙 속도/세기)
```

별도로, **시각 렌더링용 자세(visual sword pose)**는 게임 룰과 분리:
```
VisualPose ∈ ℝ²   (상대 컨트롤러의 현재 회전 — 게임 룰에 영향 없음, 단순히 화면에 표시)
```

이 분리가 중요한 이유: 검을 좌상단에 들고 있다고 해서 좌상→우하 대각 공격으로만 한정되지 않음. 같은 정지 위치에서 좌→우 수평, 좌상→좌하 수직 등 어떤 방향 스윙도 가능. 따라서 **렌더링은 자유, 룰 판정은 스윙 모션만**이라는 분리 설계가 페이크/mind game을 살린다.

**핵심 단순화 포인트**: 게임은 검의 **위치(position)나 신체 측면**을 검출하지 않고 **방향 벡터(rotation/direction)**만 검출한다. 따라서:

- 화면 어느 위치에서 마우스를 드래그하든 / 화면 어느 좌표에서 터치 스와이프하든
- 그 **벡터의 각도**만 4축으로 분류하면 게임 룰 100% 재현 가능
- `atan2(dy, dx)` → 4-way 분류 한 줄로 검출 완료

이는 PC 마우스, 모바일 터치, 자이로 어느 입력에도 동일하게 적용되며, 6인치 모바일 화면에서도 완전한 게임 로직 재현이 가능한 이유.

플랫폼별로 위 4개의 시그널을 어떻게 만들지만 다르게 설계하면 게임 로직은 공유 가능.

### 5.2 PC: 마우스 + 키보드 (1순위 권장) — 위치 기반(Position-based) 스킴

이 스킴의 핵심 메탈 모델: **"마우스 위치 = 검의 현재 자세"**. 마우스 화면 좌표를 화면 중앙 기준 벡터로 변환하고, 그 벡터의 각도를 4축에 스냅하여 검의 orientation으로 사용. Joy-Con의 손목 기울기 → 검 자세 매핑을 가장 자연스럽게 옮겨오는 방식.

| 입력 | 매핑 |
|---|---|
| **검 자세 (orientation)** | 마우스 위치 → 화면 중앙 기준 각도 → 4축 스냅(↕/↔/↗↙/↘↖) |
| **슬라이스 공격** | 좌클릭 — 현재 검 자세 축으로 스윙 발동 |
| **찌르기 공격** | 더블 클릭 또는 휠클릭 — orientation 무관, 큰 넉백 |
| **가드** | 우클릭 홀드 — 마우스 위치가 가드 검의 방향 |
| **공격 강도** | 클릭 직전 마우스 이동 속도, 또는 클릭 홀드 시간 |

**검출 공식**:
```
dx = mouseX - centerX
dy = mouseY - centerY
angle = atan2(dy, dx)
axis = round(angle / (π/4)) mod 4   // 4축 분류
```

**드래그 방식 대비 장점**:
- 자세 유지가 자연스러움 (마우스를 위치에 두기만 하면 됨)
- 각도 변경이 즉시 (마우스 이동만으로)
- 시각 피드백 항상 존재 (커서 위치 = 검 끝)
- Joy-Con의 "손목 기울기 → 검 자세" 직관과 1:1 매핑

**시각화 권장**: 마우스 커서를 검 끝(tip)으로 시각화하거나, 화면 중앙 캐릭터로부터 커서 방향으로 검을 뻗은 형태로 렌더링. 커서 자체가 검의 위치를 표현 → "마우스 = 검" 직관 완성.

**중심 영역(dead zone)**: 화면 중앙 일정 반경은 "neutral 자세"로 처리하여 미세 떨림 방지. 일정 반경 이상 이동 시에만 4축 스냅 활성화.

### 5.3 PC: 게임패드 (2순위)

| 입력 | 매핑 |
|---|---|
| **검 각도** | 우측 스틱 방향 |
| **슬라이스** | 우측 스틱을 빠르게 한쪽으로 플릭 |
| **찌르기** | 우측 트리거 |
| **가드** | 좌측 트리거 홀드 + 좌측 스틱으로 각도 |
| **강도** | 스틱 플릭 속도 |

### 5.4 모바일: 위치 기반(Position-based) 터치 (1순위 권장)

PC의 마우스 위치 스킴을 그대로 모바일로 옮김. **손가락 위치 = 검의 자세**.

레이아웃: 화면을 세로/가로로 분할하여 한쪽은 검 컨트롤, 한쪽은 (옵션) 이동/UI.

| 입력 | 매핑 |
|---|---|
| **검 자세** | 검 컨트롤 영역 내 손가락 위치 → 영역 중심 기준 각도 → 4축 스냅 |
| **슬라이스 공격** | 짧은 탭 (현재 자세 축으로 스윙) |
| **찌르기 공격** | 더블 탭 또는 두 번째 손가락 동시 탭 |
| **가드** | 길게 누르기 (홀드 중 손가락 이동으로 자세 변경) |
| **강도** | 홀드 시간 또는 탭 직전 스와이프 속도 |

**근거**: 손가락 위치는 마우스 위치와 동일한 절대 좌표 정보를 제공하므로 PC와 동일한 검출 공식 사용 가능. 스와이프 제스처보다 **자세 유지가 직관적**이고 **시각 피드백이 명확** (손가락이 곧 검의 위치).

가속도계 흔들기는 손목 피로 유발로 비추천 (다수 모바일 UX 가이드).

### 5.5 모바일: 자이로/가속도계 (2순위, 옵션)

| 입력 | 매핑 |
|---|---|
| **검 각도** | 자이로 회전(roll axis) |
| **슬라이스** | 가속도계 임펄스 감지 |
| **찌르기** | Z축 forward 임펄스 |
| **가드** | 화면 버튼 홀드 |

**유의**: Nintendo의 Joy-Con 동작은 IMU + 자이로 + 적외선 카메라의 fusion이라, 모바일 IMU만으로는 정확도가 떨어짐. **모바일에서 자이로는 보조 입력으로만 사용하고, 메인은 터치 스와이프 권장**.

### 5.6 입력 디바이스 무관한 게임 로직 보존

```
[Input Layer]                       [Game Layer]
PC mouse drag    ─┐
Touch swipe      ─┼─→  AbstractSwingEvent  ─→  Combat resolver
Gyro motion      ─┘    (angle, power, type)      (perpendicular check 등)
```

이 구조로 설계하면 **합의된 4-튜플 시그널**만 만족시키면 어떤 입력 디바이스도 1주일 안에 추가 가능.

---

## 6. 네트워크 멀티플레이 고려사항

원본 게임은 온라인 매치메이킹을 지원하며, 모션 타이밍 게임 특성상:

- **Lockstep / Rollback netcode** 채택 권장 (Timely Block 타이밍이 1~2 프레임 단위)
- **입력은 추상화 후 송신**: 마우스 좌표/자이로 raw가 아닌 `(angle, power, type, timestamp)`만 전송 → 대역폭 절감
- **Stun 상태/차지 게이지는 결정론적 계산**으로 두 클라이언트 동기화

---

## 7. 권장 다음 단계

본 리서치는 보고서까지가 범위. 사용자가 결정해야 할 다음 단계:

1. **`/sc:design`** — 게임 아키텍처(엔진 선택: Unity/Godot/Unreal/웹), 클라이언트-서버 구조, 입력 추상화 레이어 명세
2. **`/sc:brainstorm`** — 모바일에서의 가드 UX, 4방향 vs 연속각도 정밀도 trade-off
3. **`/sc:spec-panel`** — Spec 검토 (특히 netcode와 모션 입력 라이브러리 선택)
4. 별도 리서치: Unity new Input System vs Godot InputMap, Photon Quantum/Fusion 같은 결정론적 netcode 라이브러리 비교

---

## 8. Sources / 참고 자료

### 공식 자료
- [Chambara | Nintendo Switch Sports 공식 페이지 (Singapore)](https://www.nintendo.com/sg/switch/as8s/chambara/index.html)
- [Beginner Basics for Nintendo Switch Sports — Nintendo Japan](https://www.nintendo.com/jp/ichikara/as8sa/02_en.html)
- [Developer Tips Part II: Bowling, Chambara, and a…secret code — Nintendo News](https://www.nintendo.com/us/whatsnew/developer-tips-part-ii-bowling-chambara-and-a-secret-code/)

### 위키
- [Chambara | Switch Sports Wiki | Fandom](https://switchsports.fandom.com/wiki/Chambara)
- [Chambara | Wii Sports Wiki | Fandom](https://wiisports.fandom.com/wiki/Chambara)
- [Chambara — MiiWiki](https://miiwiki.org/wiki/Chambara)

### 가이드
- [Chambara Controls and Tips — Game8](https://game8.co/games/Nintendo-Switch-Sports/archives/376158)
- [Best Swords Guide — Game8](https://game8.co/games/Nintendo-Switch-Sports/archives/376612)
- [Nintendo Switch Sports - Chambara Guide — SAMURAI GAMERS](https://samurai-gamers.com/nintendo-switch-sports/chambara-guide/)
- [Best sword type for Chambara — Pro Game Guides](https://progameguides.com/nintendo-switch-sports/best-sword-type-for-chambara-in-nintendo-switch-sports/)
- [The Best Chambara sword types — Gamepur](https://www.gamepur.com/guides/the-best-chambara-sword-types-in-nintendo-switch-sports)
- [Switch Sports Chanbara Tips for Winning More Often — DiamondLobby](https://diamondlobby.com/switch-sports/chanbara-tips-for-winning/)
- [What is Chambara — Insure4Sport Blog](https://www.insure4sport.co.uk/blog/what-is-chambara/)

### 입력/구현 참고
- [Making a sword follow mouse movement — Unity Discussions](https://discussions.unity.com/t/making-a-sword-follow-mouse-movement/197657)
- [Designing A Touch Mechanic — Mobile Free To Play](https://mobilefreetoplay.com/design-touch-mechanic/)
- [Making a mobile game with motion sensors in Unity — LogRocket](https://blog.logrocket.com/making-mobile-game-motion-sensors-unity/)
- [Gesture-Based Interactions: Accelerometer + Gyroscope — MDPI Sensors](https://www.mdpi.com/1424-8220/24/3/1004)

### 참고: Wii Sports Resort 전작 비교
- [Swordplay | Wii Sports Resort Wiki](https://wiisportsresort.fandom.com/wiki/Swordplay)
- [Speed Slice | Wii Sports Resort Wiki](https://wiisportsresort.fandom.com/wiki/Speed_Slice)

---

## Appendix A: 핵심 메커니즘 결정 트리 (의사 결정용 요약)

```
Player A 공격 입력 (타입 T_a, 방향 D_a)
   ↓
Player B 가드 활성?  ── No ──→ HIT (knockback 적용, T_a=Thrust면 큰 넉백)
   ↓ Yes
T_a == Thrust ?  ── Yes ──→ BLOCKED (가드 방향 무관, 막힘)
   ↓ No (T_a == Slice)
가드 방향 D_b
   ↓
D_a ⊥ D_b ?  ── Yes ──→ Player A STUN (B의 카운터 윈도우)
   ↓ No
D_a ∥ D_b ?  ── Yes ──→ HIT (가드 관통)
   ↓ No (대각 vs 수직 등 미스매치)
   → 부분 데미지/접촉 처리 (게임 내 정확한 처리 비공개, 추정: 약한 넉백 또는 클래시)
```

**전략적 함의**:
- 찌르기는 가드 깨기용이 아니라 STUN 후 피니셔
- 찌르기 vs 가드 = 항상 BLOCK (찌르기 시도자에게 STUN이 걸리는지는 자료 미확정)
- 따라서 무방비 상대 또는 슬라이스 가드 후 카운터 콤보에만 사용

## Appendix B: 신뢰도 / 정보 격차 (Confidence & Gaps)

| 항목 | 신뢰도 | 비고 |
|---|---|---|
| 3 라운드 / 45초 | High | 공식 + 위키 + 가이드 일치 |
| 가드 perpendicular 룰 | High | 공식 개발자 팁 + 다수 가이드 일치 |
| 검 종류별 차징 메커니즘 | High | 공식 페이지 + 개발자 팁 |
| Timely Block 프레임 윈도우 | Medium | "직전"이라고만 표현, 정확한 프레임 미공개 |
| 시간 종료 시 판정 규칙 | Low | 공개된 가이드에서 명확하지 않음 — 실제 플레이 또는 데이터마이닝 필요 |
| 대각 vs 수직 등 미스매치 시 정확한 데미지 처리 | Low | 추정만 가능, 구현 시 게임플레이 영상 분석 필요 |
| Spinning Strike의 정확한 발동 모션 | Medium | "양 Joy-Con 동시 스윙" 정도의 설명, 세부 임계값 비공개 |

---

**End of Research Report**
