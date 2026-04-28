# 개발 환경 셋업

## 사전 요구사항

- **Node.js** ≥ 20 (`.nvmrc` 에 명시)
- **Yarn** ≥ 1.22 (Classic / 워크스페이스 지원)
- macOS / Linux / Windows (개발자는 macOS Darwin 25.4 기준)

```bash
node -v   # v20.x 이상
yarn -v   # 1.22.x
```

## 1. 의존성 설치

루트에서 한 번만:

```bash
cd /Users/balee/study/pieter
yarn install
```

> Yarn Workspaces 가 client / server / shared 의 모든 의존성을 한 번에 설치한다.

## 2. shared 빌드 (최초 1회)

`@vibejam/shared` 는 빌드된 `dist/` 를 통해 client / server 가 import 한다.

```bash
yarn workspace @vibejam/shared build
```

(이후 코드를 수정하면 `yarn workspace @vibejam/shared dev` 로 watch 모드 가능.)

## 3. 개발 서버 실행

가장 빠른 방법:

```bash
yarn dev
```

이 한 줄이 다음을 동시에 띄운다:
- 클라이언트: http://localhost:5173 (Vite HMR)
- 서버: ws://localhost:2567 (Colyseus + Express)
- 룸 모니터: http://localhost:2567/colyseus
- 헬스체크: http://localhost:2567/healthz

각각 따로 실행하려면:

```bash
yarn dev:server     # 서버만
yarn dev:client     # 클라만 (서버 없어도 게임은 동작, 멀티플레이는 비활성화)
```

## 4. 환경변수

선택 사항 (기본값으로 동작). 필요 시 다음 파일을 생성한다.

`server/.env`:
```
PORT=2567
NODE_ENV=development
```

`client/.env`:
```
VITE_SERVER_URL=ws://localhost:2567
```

## 5. 타입체크 / 빌드

```bash
yarn typecheck     # 모든 워크스페이스 tsc --noEmit
yarn build         # shared → client → server 순서 빌드
```

빌드 산출물:
- `client/dist/` — 정적 파일 (index.html + assets) → CDN 배포 대상
- `server/dist/` — Node 실행 가능 JS → `yarn start` 또는 PM2 / systemd / Docker

## 6. 프로덕션 실행

```bash
yarn build
yarn start         # server/dist/index.js 기동, 기본 포트 2567
```

실제 배포 시:
- **클라이언트**: Cloudflare Pages / Vercel / Netlify 정적 호스팅 (잼 규칙: 자체 도메인 필수).
- **서버**: Hetzner / Railway / Fly.io 어디든. WebSocket 지원만 확인.
- 클라 빌드 시 `VITE_SERVER_URL` 을 운영 도메인으로 지정.

## 7. 디렉토리에 추가 파일이 필요할 때

- 새 R3F 컴포넌트 → `client/src/game/`
- DOM 오버레이 → `client/src/components/`
- 클라/서버 양쪽이 보는 타입 → `shared/src/`
- 새 룸 (예: 로비, 1v1 매치) → `server/src/rooms/`
- 새 도메인 모델 → `shared/src/types.ts` 에 우선 정의

## 8. 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `Cannot find module '@vibejam/shared'` | `yarn workspace @vibejam/shared build` 누락. shared/dist 가 있어야 import 됨. |
| WebSocket 연결 실패 | 서버가 떠있지 않거나 `VITE_SERVER_URL` 가 잘못됨. `/healthz` 로 서버 살아있는지 확인. |
| `Cannot find name 'process'` (server) | `@types/node` 누락. `yarn install` 다시. |
| Vite 가 `vibej.am/2026/widget.js` 못 찾음 | 정상. 위젯은 외부 도메인 fetch 라 dev 콘솔에 CORS 경고 가능. 배포 후엔 정상. |
| Colyseus 모니터 화면이 비어있음 | 룸이 생성되어야 보임. 클라이언트에서 한 번 접속 후 새로고침. |

## 9. 다음 단계

1. **게임플레이 디자인 회의** — 비행기 슈팅인지, 다른 장르인지 결정.
2. **에셋 결정** — Blender 셀프 / Tripo3D / Kenney 무료 에셋.
3. **사운드** — 효과음 / BGM 라이선스 확보.
4. **모바일 입력** — 터치 가상 스틱.
5. **점수판** — 영구 저장 도입 시 SQLite 또는 Supabase.
6. **배포** — Cloudflare Pages (클라) + Railway (서버) 조합 검토.
