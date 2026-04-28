# fly.pieter.com 레퍼런스 분석

> 출처: 공식 사이트, @levelsio 트윗, IndieHackers, VibeCoding.Wiki, Founder's Journal Podcast, 404 Media

## 1. 게임 개요

| 항목 | 값 |
| --- | --- |
| 게임명 | fly.pieter.com (별칭 *Fly Pieter*, *Vibe Jet*) |
| URL | https://fly.pieter.com/ |
| 출시일 | 2025-02-23 |
| 개발자 | Pieter Levels (@levelsio) |
| 장르 | 무료 PvP MMO 비행기 도그파이트 |
| 시점 | 3인칭 추적 카메라 |
| 입력 | 키보드 + 마우스 (모바일 터치 지원) |

## 2. 게임플레이

- **즉시 시작**: 사이트 접속 → 로그인/스플래시 없이 곧장 비행기 조종.
- **간소화된 아케이드 조작**: 시뮬레이션 X. 좌·우·상·하의 단순 비행.
- **전투**: 공중전 (도그파이트). 머신건 → 미사일 순으로 점진적 추가.
- **맵**: low-poly 오픈 월드. 활주로, 들쭉날쭉한 절벽 (개발자 거주 해변마을 영감), 이후 화성(Mars) 맵 추가.

## 3. 기술 스택

| 레이어 | 선택 |
| --- | --- |
| 렌더링 | **vanilla Three.js** (R3F 미사용) |
| 번들러 | 없음. ES 모듈 / 단일 SPA |
| 멀티플레이 (초기) | PeerJS (WebRTC) + WebSocket 혼합 → NAT/안정성 문제로 폐기 |
| 멀티플레이 (현재) | 자체 WebSocket 서버 |
| 결제 | Stripe |
| 호스팅 | Hetzner 베어메탈 + Cloudflare (DNS/CDN) |
| AI 도구 | Cursor + Grok 3 + Claude 3.7 Sonnet + ChatGPT (디버깅) |

## 4. 수익화

- **인게임 광고**: 3D 빌보드 / 비행선(blimp) 광고 슬롯. 슬롯당 월 $5,000 가량.
- **프리미엄 기체**: F-16 등 특수 능력 기체 일회성 결제 $29.99.
- **스폰서드 오브젝트**: 클라우드 스폰서십 (예: bolt.new) 등 창의적 광고.
- **매출 추이**:
  - 13일 차 $67K MRR
  - 17일 차 $1M ARR
  - 피크 $100K+ MRR
  - 2025년 3월 기준 월 32만 명 이상 플레이.

## 5. 개발 과정

- 게임 개발 무경험 상태에서 **약 3시간** 만에 첫 프로토타입을 Cursor 로 vibe-coding.
- 트윗 인사이트: "코드 80%는 AI, 20%는 사람의 디버깅 개입".
- 이후 며칠 ~ 몇 주에 걸쳐 멀티플레이·광고·결제를 점진적으로 추가.

## 6. 본 프로젝트가 차용할 핵심 패턴

다음 8가지를 본 프로젝트의 설계 원칙으로 명시한다.

1. **Zero-friction 진입**
   - 랜딩 = 게임. 로그인 / 튜토리얼 / 스플래시 없음.
   - R3F: `<Canvas>` 마운트 즉시 게임 시작, 닉네임은 익명 자동 생성.
   - 본 프로젝트: `App.tsx` → `Game.tsx` 즉시 마운트, 서버에서 `pilot-{sessionId}` 자동 부여.

2. **저폴리 자체 제작 에셋**
   - Blender 로 수십 폴리곤짜리 비행기·지형.
   - `MeshBasicMaterial` / `MeshStandardMaterial` + 단색으로 GPU 부담 최소화.
   - 모바일 호환의 핵심.

3. **단일 SPA + 가벼운 번들러**
   - 빠른 반복을 위해 Vite 사용. Next.js 는 이 규모에 오버킬.

4. **하이브리드 네트워킹 → WebSocket 단일화**
   - 위치/회전을 ~10–20Hz 로 상태 동기화, 클라이언트는 보간으로 부드럽게.
   - 클라이언트 권위 모델로 서버 비용 최소화 (단, 안티치트 필요 시 서버 권위로 전환 가능).
   - 본 프로젝트: **Colyseus** 채택 (PeerJS 같은 NAT 함정 회피, 룸/스냅샷/델타 동기화 내장).

5. **공유 월드 + 무인스턴스**
   - 모든 플레이어가 같은 거대한 하늘에 있음.
   - 시야 외 컬링 (`THREE.Frustum`) 으로 성능 확보.

6. **모바일/데스크톱 통합 입력**
   - `pointerdown`/`pointermove` 추상화, 가상 스틱 + 키보드 동시 지원.

7. **광고를 게임 오브젝트로**
   - 외부 iframe 이 아닌 텍스처드 3D 빌보드로. AdBlock 내성 + 몰입 깨짐 없음.
   - R3F: `<Decal>` 또는 동적 `CanvasTexture`.

8. **SSR 없는 클라이언트 전용 렌더**
   - SEO 보다 즉시 인터랙션 우선.
   - Vite + 정적 호스팅 (CDN) 으로 충분.

## 7. 경쟁 / 유사 사례

- **vibe-jet** ([cedrickchee/vibe-jet](https://github.com/cedrickchee/vibe-jet)) — Gemini 2.5 Pro 로 만든 fly.pieter.com 클론. Three.js 멀티플레이 학습용 오픈소스.
- 잼 우승작 *The Great Taxi Assignment*, *Vibeware*.

## 8. 미해결 / 후속 조사

- 서버 권위 검증 / 안티치트 로직: 공식 자료 없음. 패킷 캡처 필요.
- R3F + zustand 로 동일 구조 만든 공식 사례 부족 → 본 프로젝트가 PoC 역할.
- 모바일 동시접속 N명 시 FPS / latency 수치는 비공개.

## 출처

- https://fly.pieter.com/
- https://www.indiehackers.com/post/tech/pieter-levels-used-ai-to-build-a-viral-flight-simulator-in-3-hours-with-no-background-in-game-development-7CPfMr1yRLEwH6cC8xhE
- https://www.vibecoding.wiki/games/fly-pieter-com-by-levelsio/
- https://x.com/levelsio/status/1893385114496766155 (3시간 / Cursor)
- https://x.com/levelsio/status/1899596115210891751 ($1M ARR)
- https://x.com/levelsio/status/1897784027186446820 ($67K MRR @ 13일)
- https://generativeai.pub/how-pieter-levels-built-a-100k-mrr-flight-simulator-with-ai-be91290419bb
- https://www.404media.co/this-game-created-by-ai-vibe-coding-makes-50-000-a-month-yours-probably-wont/
- https://podcasts.apple.com/us/podcast/how-pieter-levels-hit-%2467k-mrr-in-3-weeks/id1509276485?i=1000698552948
- https://github.com/cedrickchee/vibe-jet
