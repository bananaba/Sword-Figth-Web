# Ranked Multiplayer on Cloudflare

> 작성: 2026-04-29
>
> 목적: game jam 제출 목표에서 **무료 범위**로 가장 경쟁력 있는 1v1 랭크 멀티플레이 구조를 정한다.

## 결론

현재 듀얼 멀티 서버가 아직 구현되지 않았고, Colyseus 서버도 폐기된 비행기 스캐폴드 중심이다. 따라서 기존 Node/Colyseus 서버를 Render/Railway에 올리는 것보다, 새 멀티플레이 서버는 **Cloudflare Workers + Durable Objects**로 구현한다.

추천 조합:

```text
Cloudflare Pages 또는 Vercel
  - React/Vite 클라이언트
  - 정적 파일/CDN/HTTPS

Cloudflare Worker
  - HTTP endpoint: /matchmake, /leaderboard, /me
  - WebSocket upgrade 라우팅

Cloudflare Durable Objects
  - RankedQueue DO: 랭크 매칭 큐
  - DuelRoom DO: 실제 1v1 방, 서버 권위 판정

Durable Object SQLite / Workers KV
  - player rating
  - match result
  - leaderboard cache
```

프론트는 이미 Vercel 배포가 익숙하면 Vercel을 유지해도 된다. Cloudflare Pages로 옮기면 Worker/DO와 같은 플랫폼이라 CORS, 환경변수, 도메인 관리가 단순해진다.

## 왜 Cloudflare Durable Objects인가

이 게임은 방 하나가 작고 명확하다.

- 방 정원: 2명
- 룸 상태: fighter state, guard snapshot, pending attack, round timer
- 서버 권위 판정: `shared/src/combat/resolveAttack`
- 결과 broadcast: state, impact, roundOver, matchOver

Durable Object는 이 모델과 잘 맞는다. **방 하나 = Durable Object 하나**로 두면 룸 상태를 메모리에 들고 WebSocket으로 양 플레이어에게 즉시 broadcast할 수 있다.

무료 기준 장점:

- Workers Free에서 WebSocket upgrade 가능
- Durable Objects Free 사용 가능
- SQLite-backed Durable Objects Free 사용 가능
- Workers KV Free로 leaderboard cache 가능
- Render Free의 15분 idle sleep / cold start 리스크가 없음

주의:

- Colyseus를 그대로 배포하는 방식이 아니다.
- `server/src/rooms/GameRoom.ts`를 확장하기보다 Worker/DO용 서버를 새로 작성한다.
- Node 서버 API 전체를 기대하지 말고, 작은 전용 프로토콜로 간다.

## 랭크 우선순위

game jam에서 가장 명확한 경쟁력은 4/8/16인 토너먼트보다 **즉시 랭크 1v1**이다.

P0:

- `Ranked Match` 버튼
- 닉네임 입력 + localStorage `playerId`
- 랭크 매칭 큐
- 1v1 서버 권위 DuelRoom
- 승패 후 ELO 갱신
- Top 20 leaderboard

P1:

- 사설방 코드 생성/입장
- rematch
- reconnect

P2:

- 4/8/16인 자동 토너먼트
- 계정 로그인
- 시즌/전적 페이지

## 랭크 모델

처음에는 단순 ELO로 충분하다.

```text
initialRating = 1000
K = 32
matchRange = +/- 200
queueExpandAfter = 30s
```

업데이트:

```text
expectedA = 1 / (1 + 10 ^ ((ratingB - ratingA) / 400))
newA = ratingA + K * (scoreA - expectedA)
```

점수:

```text
win = 1
draw = 0.5
loss = 0
```

jam 제출용 계정 모델:

```text
client:
  localStorage["chambara.playerId"]
  localStorage["chambara.name"]

server:
  playerId -> rating, wins, losses, draws, updatedAt
```

완전한 인증은 잼 이후로 미룬다. 이번 범위에서는 서버 권위 판정이 랭크 신뢰도의 핵심이다.

## 서버 권위 DuelRoom

클라이언트는 입력과 시각 예측만 한다. 최종 판정은 서버가 한다.

클라이언트가 보내는 메시지:

```ts
type ClientMessage =
  | { t: "hello"; playerId: string; name: string; saberColor: string }
  | { t: "ready" }
  | { t: "guard"; active: boolean; grip: Vec2; tip: Vec2; seq: number; clientNow: number }
  | { t: "attack"; kind: "slice" | "thrust"; origin: Vec2; direction: Vec2; reach: number; seq: number; clientNow: number };
```

서버가 보내는 메시지:

```ts
type ServerMessage =
  | { t: "hello"; side: "player" | "opponent"; rating: number }
  | { t: "state"; serverNow: number; player: FighterNetState; opponent: FighterNetState; match: MatchNetState }
  | { t: "impact"; outcome: Outcome; attackerSide: "player" | "opponent"; at: number }
  | { t: "roundOver"; winner: "player" | "opponent" | "draw"; reason: "ringout" | "timeout" }
  | { t: "matchOver"; winner: "player" | "opponent"; ratingDelta: number; ratings: Record<string, number> };
```

서버 tick:

```text
30Hz minimum
60Hz preferred if free limits remain comfortable
```

판정 방식:

1. 서버가 각 플레이어의 latest guard snapshot을 유지한다.
2. attack 수신 시 cooldown/stun/motion gate를 서버에서 확인한다.
3. windUp 후 impact timestamp에 `resolveAttack` 호출한다.
4. `applyOutcome`으로 fighter state를 갱신한다.
5. outcome과 state를 양쪽에 broadcast한다.

## 지연 보정

최소 구현은 latest state 판정으로 시작한다. 여유가 있으면 최근 200-300ms history를 둔다.

```text
history:
  timestamp
  player guard
  opponent guard
  positions
  velocities
```

공격 메시지의 `clientNow`를 서버 clock offset으로 보정하고, impact 시점 근처 guard snapshot을 찾아 판정한다. 이 보정은 “내 화면에서는 막았는데 맞았다” 체감을 줄이는 데 중요하다.

## 저장소 선택

권장:

- rating 원본: Durable Object SQLite
- leaderboard cache: Workers KV

대안:

- 작은 규모에서는 rating까지 KV만으로도 가능하지만, 같은 key 쓰기 1초 제한과 leaderboard 정렬이 불편하다.
- D1도 가능하지만 이번 구조에서는 Durable Object 내부 SQLite가 룸/큐와 가까워 더 단순하다.

## 기존 코드와의 연결

재사용:

- `shared/src/combat/types.ts`
- `shared/src/combat/geometry.ts`
- `shared/src/combat/resolver.ts`
- `shared/src/combat/weapons.ts`

새로 만들 것:

- Cloudflare Worker entrypoint
- `RankedQueue` Durable Object
- `DuelRoom` Durable Object
- 클라이언트 network adapter
- ranked UI entrypoint

기존 `server/src/rooms/GameRoom.ts`는 참고만 한다. 현재는 듀얼 룰과 맞지 않는 비행기 스캐폴드다.

## 배포 방침

무료 + 경쟁력 우선:

```text
1. Cloudflare Pages + Workers + Durable Objects
2. Vercel client + Cloudflare Workers + Durable Objects
3. Vercel client + Render Free Colyseus
```

현재 결정:

```text
멀티/랭크 서버는 Cloudflare Workers + Durable Objects로 구현한다.
프론트 배포는 Vercel 또는 Cloudflare Pages 중 작업 속도가 빠른 쪽을 선택한다.
Render/Railway/Colyseus 배포는 fallback으로만 둔다.
```

