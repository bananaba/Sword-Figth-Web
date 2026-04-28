# 기술 스택과 선택 근거

## 요약

| 레이어 | 선택 | 핵심 근거 |
| --- | --- | --- |
| 패키지 매니저 | **Yarn 1.22 (Classic)** | 사용자 지정. 워크스페이스 안정 지원. |
| 모노레포 | **Yarn Workspaces** | 클라이언트·서버·공유 타입을 한 저장소에서 관리. |
| 언어 | **TypeScript 5.6 strict** | 사용자 지정. shared 타입으로 클라/서버 계약 강제. |
| 프론트 빌드 | **Vite 5** | R3F 생태계 표준. HMR 빠르고 dev/prod 동일 구성. |
| UI 프레임워크 | **React 18** | 사용자 지정. Concurrent features. |
| 3D 렌더 | **Three.js 0.170 + React Three Fiber 8** | Three 가 Vibe Jam 권장. R3F 로 React 컴포넌트 모델 적용. |
| 3D 헬퍼 | **@react-three/drei** | Sky / Stats 등 즉시 사용 가능한 컴포넌트. |
| 클라 상태 | **Zustand 5** | Redux 대비 가볍고 R3F 와 잘 어울림. |
| 멀티플레이 | **Colyseus 0.16** | 룸 / 상태 동기화 / 모니터 내장. PeerJS NAT 함정 회피. |
| 서버 런타임 | **Node 20 (commonjs)** | Colyseus 데코레이터 + commonjs 안정 조합. |
| 서버 dev | **tsx watch** | TS 직접 실행, 빠른 재시작. |
| HTTP | **Express 4** | Colyseus 기본 통합. 헬스체크 / 모니터 라우트 호스팅. |
| CORS | **cors** | 클라/서버 도메인 분리 시 필수. |

## 결정 근거 상세

### 왜 Colyseus 인가?

- **목표**: "최소한의 정보 저장소" 로 시작하지만 "온라인 게임으로 전환 가능" 해야 함.
- **대안 비교**:
  - *순수 ws + 직접 구현*: 가장 가볍지만 룸·매치메이킹·델타 직렬화를 직접 만들어야 함. 잼 일정에는 불리.
  - *Socket.IO*: 대중적이지만 게임 상태 동기화 추상화는 직접 만들어야 함.
  - *PeerJS / WebRTC*: Pieter 본인이 NAT 문제로 폐기한 사례. 학습 비용 대비 리턴 낮음.
  - *Colyseus*: `Schema` 기반 자동 델타 압축, `MapSchema` 로 플레이어 컬렉션 즉시 동기화, 모니터 대시보드, Hetzner / Render / Railway 어디든 배포. **이번 잼에 가장 일치**.
- **위험**: Colyseus 의존성으로 서버 번들이 커짐 → 클라이언트 번들에는 영향 없음 (`colyseus.js` 만 사용, 매우 가벼움).

### 왜 React Three Fiber 인가?

- Pieter 본인은 vanilla Three.js 사용. 그러나 본 프로젝트는 React (사용자 지정) 와 결합해야 하므로 R3F 가 자연스러운 선택.
- 컴포넌트 모델 → HUD / 메뉴 / 게임 오브젝트가 동일한 React 트리.
- drei / cannon / rapier 같은 풍부한 보조 라이브러리.

### 왜 Zustand 인가?

- Redux/Context 대비 보일러플레이트 거의 없음.
- R3F 의 `useFrame` 안에서도 `useStore.getState()` 로 가볍게 동기 접근 가능 → 불필요한 리렌더 방지.

### 왜 shared 워크스페이스인가?

- 클라/서버가 같은 `InputCommand`, `Vec3`, `MessageType` 을 본다.
- 프로토콜 변경 시 한쪽만 수정하면 컴파일 에러로 즉시 감지.
- `MessageType` 같은 상수도 양쪽이 공유 → 매직 스트링 제거.

### 왜 Vite 인가?

- HMR 속도 = 잼의 생명선.
- R3F 공식 스타터, 커뮤니티 자료 풍부.
- 정적 산출물 → CDN 한 번에 배포 (Vibe Jam 의 "즉시 로딩" 충족 용이).

## 추가될 가능성이 있는 의존성

> 필요 시점에 도입. 현 시점에 미리 깔지 않음.

| 후보 | 용도 | 도입 트리거 |
| --- | --- | --- |
| `@react-three/rapier` | 물리 / 충돌 | 충돌 판정이 필요한 슈팅으로 확장 시 |
| `meshline` / `postprocessing` | 비주얼 강화 | 화려한 이펙트가 필요한 경우 |
| `howler` 또는 native `AudioContext` | 사운드 | 효과음 도입 시 |
| `better-sqlite3` 또는 `@supabase/supabase-js` | 영구 저장 (점수판) | 점수 / 통계 영구화 필요 시 |
| `vitest` + `@testing-library/react` | 테스트 | 로직 회귀 방지 필요 시 |
| `eslint` + `@typescript-eslint/*` | 린트 | 팀 합류 / CI 도입 시 |

## 비선택 / 의도적 배제

- **Next.js**: 1인 SPA 게임에 SSR 불필요. Vite 로 충분.
- **Redux Toolkit**: 게임 상태는 R3F 내부 ref + Zustand 로 충분.
- **Tailwind CSS**: HUD 가 작아 손으로 쓴 CSS 가 더 빠름. 추후 필요 시 도입 검토.
- **Webpack / Parcel**: Vite 보다 느리거나 설정 부담.
- **PeerJS**: Pieter 의 실패 케이스를 그대로 따라가지 않기 위해 의도적으로 배제.
