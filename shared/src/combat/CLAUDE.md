# shared/src/combat/ — Pure Combat Logic

> 클라/서버가 공유하는 결정론적 전투 로직. **랭크 게임 / 권위 서버 / 리플레이 호환의 전제 조건**이 여기서 깨지면 안 됨.

## 파일

- `types.ts` — `Vec2`, `FighterState`, `GuardSnapshot`, `AttackEvent`, `Outcome`, `WeaponStats`
- `geometry.ts` — 선분/박스 교차, 두 선의 예각. 순수 수학.
- `weapons.ts` — `PLASMA_BLADE` 디폴트 + 확장 포인트 (IP-안전 네이밍 — `claudedocs/research_character_weapon_customization_20260429.md` §7.3)
- `resolver.ts` — `resolveAttack` / `applyOutcome` / `tickFighter`
- `index.ts` — 배럴 익스포트 (`@vibejam/shared`)

## 절대 깨면 안 되는 불변량

1. **순수함수**: 모든 함수가 인자에만 의존, side-effect 0. `Math.random()` / `performance.now()` / `console.log` 금지. (timestamp가 필요하면 인자로 받음.)
2. **결정론**: 같은 입력 → 같은 출력. 클라와 서버가 같은 resolver를 호출해서 같은 결과를 내야 함 (랭크 리플레이 / 권위 서버).
3. **불변(immutable) 상태**: `applyOutcome`은 새 객체 반환. 입력 state mutation 금지 (`...state, field: x` 패턴).
4. **`posX` 필드명은 사실 world Z** (duel-line 축). 이름은 시스템 구조상 그대로 유지 — 변경하면 외부 호출자도 모두 영향. 주석으로만 명시.

## 주요 개념

- **공격 라이프사이클**: input → windUp → impact → swing → recovery (`useDuelLoop`이 timeline 관리, resolver는 impact 시점만 발동).
- **결정 트리** (`resolveAttack`):
  ```
  stunUntil/motion 가드             → MISS/REJECTED
  thrust + guard active            → BLOCK + STUN
  thrust + 무방비                  → HIT (counterActive ? counterKnockback : thrustKnockback)
  slice + 가드 비활성/비교차       → HIT
  slice + 가드 perp 교차           → BLOCK + STUN + counter window
  slice + 가드 평행 교차           → PIERCE
  ```
- **applyOutcome**:
  - `hit`/`pierce` → **defender `stunUntil = 0`** (피격 시 stun 즉시 해제). post-hit 무적은 제거됨; 연속 공격 방지는 cooldown/pending gate가 담당.
  - `block` → `attackerStun > 0`이면 공격자 stun, `defenderCounterWindow > 0`이면 디펜더 카운터
  - 넉백: `attackerFollowFraction = 1.0` → 거리 보존 (양쪽 같은 속도로 이동)

## 주요 튜닝 노브 (현재 PLASMA_BLADE)

- 넉백: slice 8 / counter 10 / **thrust 14** (slice < counter < thrust 위계)
- 타이밍: `stunMs = 1500` (단일 변수 — 공격자 stun = 카운터 윈도우 = thrust block stun)
- 마찰: `FRICTION = 5.0` (`useDuelLoop.ts`에 있음, weapons.ts 아님)

## 변경 시

- 새 룰 추가 → resolver의 결정 트리 + types.ts의 Outcome → `useDuelLoop` 통합 + `Fighter.tsx` 시각화
- 새 weapon stat → `WeaponStats` + `PLASMA_BLADE` 디폴트 + `DuelDebug` 슬라이더 + `tuningFromWeapon`/`tuningToWeaponPatch`
- 빌드: `yarn workspace @vibejam/shared build` 후 client typecheck
- 테스트는 아직 없음 (백로그) — 회귀 시 직접 `?demo=arena`로 검증

## 자세한 룰 ↔ 코드 매핑

→ `docs/duel-implementation.md` §3 사용자 피드백 표, §4 전투 모델 디테일.
