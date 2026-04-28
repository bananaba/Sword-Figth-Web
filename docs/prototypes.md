# Prototypes — 데모 라우트 가이드

> 모든 라우트는 `yarn dev:client` 또는 `yarn dev:client:https` 후 단일 dev 서버에서 동작.
> 자이로 / iOS 테스트는 HTTPS 모드 필수.

## 실행

```bash
# 일반 (HTTP)
yarn dev:client                # 데스크톱 빠른 개발

# HTTPS (자이로 / iOS / LAN 폰 접속)
yarn dev:client:https
```

LAN 접속용 IP 확인: `ipconfig getifaddr en0` (현재 환경 `192.168.0.2`).

자체 서명 인증서 경고 — "고급 → 안전하지 않은 사이트로 이동" 한 번 통과.

## 라우트별 상세

### 1. `/?demo=character` — Three.js 휴먼 렌더링 검증

**검증 목적**: Three.js 가 인간 캐릭터를 충분히 잘 렌더링하는지 시각으로 확인.

**파일**: `client/src/demo/HumanCharacterDemo.tsx`

**에셋**: `client/public/models/soldier.glb` (Three.js 공식 예제 모델, ~2.1MB, CC-BY)

**조작**:
- 마우스 드래그 → 카메라 오빗
- 스크롤 → 줌
- 좌상단 버튼 → Idle / Walk / Run 애니메이션 토글

**결론**: drei `useGLTF` + `useAnimations` 표준 패턴으로 풀바디 리깅 캐릭터가 정상 동작. 잼 출품 시는 더 가벼운 에셋(Ready Player Me ~300KB / Quaternius 로우폴리 ~50-150KB / Tripo3D 사전 생성) 권장. → **Three.js로 인간 가능, 에셋 부담은 별개 문제**.

---

### 2. `/?demo=sword` — 검 각도 입력 프로토타입

**검증 목적**: 마우스/터치/자이로의 입력 감각이 chambara 게임에 적합한지.

**파일**:
- `client/src/demo/SwordPrototype.tsx`
- (사용 훅) `client/src/hooks/useSwordInput.ts`

**조작**:

| 디바이스/모드 | 검 각도 | 가드 |
| --- | --- | --- |
| 데스크톱 | 마우스 위치 (상시 추적) | 마우스 클릭+홀드 |
| 모바일 자이로 | 폰 좌우 기울기 | 화면 탭+홀드 |
| 모바일 터치 | 첫 손가락 드래그 | 두 번째 손가락 |

**자이로 모드 진입**:
1. 우상단 **📱 Use phone tilt** 탭
2. iOS: 권한 다이얼로그 → 허용
3. **🎯 Recenter** 로 정 중앙(검 위) 재설정 가능
4. **🖱 Switch to touch** 로 복귀

**HUD**:
- `WIELD` / `GUARD` 상태
- 검 끝 속도(tip v) — 임계 8 이상이면 노란빛 (스윙 감지)
- 자이로 모드: `SWING` 배지 (가속도 스파이크 감지)
- mode: 현재 입력 모드 표시

**튜닝 가능 상수** (코드 내):
- `SWORD_LERP = 0.28` — 검 따라옴 부드러움
- `SWING_VELOCITY_THRESHOLD = 8` — 스윙 감지
- `ACCEL_SWING_THRESHOLD = 18` — 자이로 모드 가속도 스파이크 (m/s²)

---

### 3. `/?demo=arena` — Chambara 트레이닝 아레나

**검증 목적**: 직각 블록 판정 + 점수 + 슬라이더 튜닝으로 게임 감각 검증.

**파일**: `client/src/demo/ChambaraArena.tsx`

**화면 구성**:
- **회색 원 (왼쪽)** — 플레이어. 검은 입력 추적
- **빨간 원 (오른쪽)** — 트레이닝 더미. 자체 사이클 반복
- 더미 검 색이 페이즈 표시:
  - 회색 = idle (대기)
  - **주황색** = telegraph (공격 예고)
  - **빨강** = impact (임팩트 순간)

**판정 규칙**:
임팩트 순간(주황 → 빨강 전환):
- `|playerAngle − attackerAngle| mod 180°` 가 **90° ± tolerance** 범위 + 가드 활성 → **BLOCK** (파란 링)
- 그 외 → **HIT** (빨간 링)

**HUD (좌상단)**:
- Blocks / Hits / Streak / Best 카운터
- Reset 버튼

**슬라이더 (좌하단, 실시간 조정)**:
- **Tolerance** 5-45° (기본 25°) — 차단 허용폭
- **Telegraph** 300-1500ms (기본 800ms) — 공격 예고 시간
- **Idle** 500-3000ms (기본 1500ms) — 공격 간격

**더미 공격 각도 풀**: 7종 랜덤 — 수직 / 수평(2종) / 사선 4종 + 살짝 아래

**평가할 것**:
1. Tolerance 25° 가 적절한가
2. Telegraph 800ms 가 공정한 반사 윈도우인가
3. 공격 각도 다양성 충분한가
4. 시각 피드백 명확한가
5. 모바일 자이로 / 터치 모드에서도 잘 되는가

---

### 4. `/` — 비행기 스캐폴드 (사용 안 함)

**파일**: `client/src/game/Game.tsx` 외

**상태**: 컨셉 폐기. R3F + Colyseus 인프라 동작 확인용으로만 유지. 실제 출품 게임은 chambara 아레나로 발전 예정 → 나중에 `Game.tsx` 가 chambara로 교체될 것.

## 디버깅

### `/?demo=arena` 가 안 뜬다
- HMR 캐시: 새로고침 (자이로 모드는 새로고침 시 권한 다시 요청)
- typecheck: `yarn workspace @vibejam/client typecheck`

### 자이로가 안 동작 (iOS)
- HTTPS 모드 인지 확인 (`yarn dev:client:https`)
- 인증서 경고 통과했는지
- 권한 다이얼로그 나왔는지 (안 나오면 HTTP 일 가능성)
- Settings → Safari → Motion & Orientation Access 켜져 있는지

### 자이로가 안 동작 (Chrome Android)
- HTTP 도 동작하는 경우 있으나 권장 안 함
- DeviceOrientation 권한이 자동 부여되는 경우가 많음

### 검이 너무 빠르거나 느림
- `client/src/hooks/useSwordInput.ts` 또는 각 데모의 `SWORD_LERP` 상수 조정 (현재 0.28)

### 차단이 너무 어렵/쉬움
- 아레나 좌하단 Tolerance 슬라이더로 실시간 조정. 기본 25° → 35° 정도가 더 너그러움

## 다음 추가 후보

- `?demo=match` — Colyseus 1v1 매치메이킹 시연 (현재 server 인프라 활용)
- `?demo=ai` — AI 봇 상대 (chambara를 단독 플레이로 즐길 수 있게)
- `?demo=stage` — 좁은 발판 + 물 + 낙하 판정 (스위치 스포츠 원작 형태)
