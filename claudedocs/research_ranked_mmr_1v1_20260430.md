# 1v1 게임 랭크 점수 및 MMR 시스템 연구

**작성일**: 2026-04-30
**작성자**: Deep Research Agent (for Chambara Duel)
**목적**: Chambara Duel(웹 기반 1v1 칼싸움 듀얼, Vibe Jam 2026 출품, Cloudflare Workers + Durable Objects, 현재 ELO K=32) 랭크 시스템의 잼 직후~정식 운영 단계 개선 의사결정을 위한 레퍼런스
**범위**: 알고리즘 5종, 실제 1v1/소규모 게임 12종 사례, 표시 점수 vs 숨겨진 MMR, 매칭 품질, 부정행위 방지, UX, 저인구 인디 권장 구성
**1차 출처 우선**: Glickman 논문, Microsoft Research (TrueSkill), Riot Support, Capcom 공식 공지, Lichess 문서, Cloudflare Docs 등

---

## 1. Executive Summary

1v1 비대칭 정보 게임의 랭크 시스템은 본질적으로 **세 가지 함수**를 동시에 수행해야 한다. (a) 플레이어의 진짜 실력을 통계적으로 추정하는 **Skill Estimator**, (b) 비슷한 실력 페어를 만들어 주는 **Matchmaker**, (c) 플레이어가 "성장한다"고 느끼게 하는 **Reward Surface**. 학계에서 출발한 ELO/Glicko/TrueSkill 계열은 (a)와 (b)를 잘 다루지만, 현대 라이브 게임 (LoL, Valorant, SF6, Tekken 8, CS2)은 모두 (c)를 위해 **표시 점수(LP/RR/MR)와 숨겨진 MMR을 분리**하는 구조로 수렴했다.

알고리즘 선택은 **인구 규모와 한 플레이어의 누적 경기 수**가 결정한다. 1k 미만 활성 인구의 신생 인디 1v1에서는 ELO + 동적 K-factor가 가장 안전하고, 5k+ 안정 인구로 들어가면 Glicko-2 (특히 Lichess처럼 분수 rating period로 즉시 업데이트하는 변형)가 사실상 표준 선택지가 된다. TrueSkill은 강력하지만 Microsoft 특허 + 복잡도 문제로 1v1만 다룰 거라면 과잉이며, 같은 베이지안 접근이 필요하면 OpenSkill (Weng-Lin)이 더 합리적이다.

가장 자주 간과되는 실무 이슈는 **콜드스타트와 저인구 매칭 풀**이다. 신규 계정의 σ/RD를 크게 잡고(또는 K-factor를 일시적으로 2~3배로 올리고), 매칭 윈도우를 시간에 따라 점진적으로 넓히는 두 장치를 결합해야 한다. 본 프로젝트처럼 잼 직후 누적 인구가 수백 명에 그칠 가능성이 큰 환경에서는 "배치 10판 후 정식 MMR 부여"보다 "배치 5판은 표시 안 함 + RD 자동 수렴" 방식이 인디 경험상 이탈률이 낮다.

표시 점수와 숨겨진 MMR 분리는 잼 출시 직후에는 필요 없다. 하지만 **재방문 유저가 50명 이상 모이는 시점부터는 거의 필수**다. 이 분리가 없으면 (a) MMR 수렴이 느린 신규에게 불공평한 매칭이 잡히고, (b) 부스팅 후 "이미 스마트픽 됨" 같은 점수 시스템 신뢰 붕괴가 빠르게 일어난다.

마지막으로 Chambara Duel의 Cloudflare Workers + Durable Objects 환경은 **싱글 라이터 보장**이라는 강점을 알고리즘 선택의 호재로 활용해야 한다. RankedQueue/플레이어 DO 단위로 락 없이 ELO 또는 Glicko-2 업데이트를 원자적으로 수행할 수 있고, "rating period" 같은 배치 처리도 cron triggered DO로 깔끔하게 떨어진다. 즉, **구현 복잡도 측면에서 Glicko-2 도입의 진입 장벽이 평소보다 낮은** 인프라다.

---

## 2. 핵심 알고리즘 비교

### 2.1 ELO

- **출처**: Arpad Elo, 1960s, USCF/FIDE 채택 (Wikipedia: Elo rating system)
- **모델**: 두 플레이어 R_A, R_B의 승률을 로지스틱 함수로 추정. `E_A = 1 / (1 + 10^((R_B - R_A)/400))`
- **업데이트**: `R'_A = R_A + K * (S - E_A)` (S는 1/0.5/0)
- **K-factor**: FIDE는 신규(< 30경기)는 K=40, < 2400 레이팅은 K=20, ≥ 2400 도달 시 K=10. 18세 미만은 < 2300까지 K=40 유지. ([FIDE](https://ratings.fide.com/calc.phtml?page=change), [Chess.com](https://www.chess.com/terms/elo-rating-chess))
- **장점**: 단일 숫자, 구현 5줄, 이해 쉬움, 결정론적 → Cloudflare DO에서 원자 업데이트가 자명함
- **한계**:
  - 한 판 변동성을 신뢰도로 표현 못 함 → 신규/베테랑 매칭 시 베테랑이 손해
  - 활동/비활동에 따른 RD 같은 "확실성" 차원 없음
  - 콜드스타트가 약함 (해결책으로 동적 K가 표준)
  - 단판 결과의 분산을 낮추려면 K를 작게 가져가야 하는데, 그러면 수렴이 느려짐 (트레이드오프)

### 2.2 Glicko / Glicko-2

- **출처**: Mark Glickman, 1995/2012 ([glicko.net](http://www.glicko.net/glicko.html), [Glicko-2 paper](https://glicko.net/glicko/glicko2.pdf))
- **상태 변수**: `(rating r, rating deviation RD, volatility σ)`
- **핵심 동기**: ELO가 표현 못 하는 **추정 신뢰도**(RD)와 **변동성 진폭**(σ)을 명시적으로 모델링
- **권장 초기값**: r=1500, RD=350, σ=0.06, system constant τ=0.5 (Glickman)
- **Rating Period**: 원논문은 "한 기간 내 최소 10~15판" 가정. 실시간 게임에는 부적합 → **분수 rating period** 변형이 사실상 표준 ([Lichess: liglicko2](https://github.com/niklasf/liglicko2), [instant-glicko-2](https://github.com/gpluscb/instant-glicko-2))
- **비활동 페널티**: 게임 안 하면 RD가 시간에 따라 증가 → 매칭 폭이 자동으로 넓어짐. Lichess는 "1년 비활동 시 RD 60→110" 곡선을 쓴다.
- **단판 업데이트 패턴 (Lichess 방식)**:
  1. 새 게임 도착 시점 t 측정
  2. RD를 `sqrt(phi^2 + Δt × sigma^2)`로 시간 보정
  3. 단일 결과로 그대로 Glicko-2 step 1회 적용 (배치 대신)
- **장점 (1v1)**:
  - 신규/복귀 플레이어에게 큰 RD를 줘 빠르게 수렴 + 베테랑 점수 보호
  - 매칭 신뢰 구간(±2RD)이 자연스럽게 매칭 윈도우 정의
  - 부스팅/스머프가 "고RD인데 지나치게 강함" 패턴으로 통계적으로 두드러짐
- **한계**:
  - 구현이 ELO보다 30~50배 길어지고 부동소수 안정성 주의 필요
  - "draw probability"가 명시적으로 없어 무승부 비율 높은 게임은 따로 확장 필요 (체스 연방에서 (β₀, β₁) 로그 무승부 odds 확장 사례 있음)
  - τ 튜닝이 게임마다 다름 — 일반적으로 0.3~1.2 권장, FPS/격투는 더 높게

### 2.3 TrueSkill / TrueSkill 2

- **출처**: Herbrich, Minka, Graepel (Microsoft Research, NeurIPS 2006); TrueSkill 2 (Minka et al., 2018) ([TrueSkill paper](http://papers.neurips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system.pdf), [TrueSkill 2 PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/trueskill2.pdf))
- **상태 변수**: 각 플레이어 skill ~ N(μ, σ²); 게임당 performance ~ N(skill, β²); 결과는 performance 비교
- **추론**: 팩터 그래프 + Expected Propagation (sum-product)
- **1v1 단축**: `rate_1vs1`, `quality_1vs1` 함수 제공 (1v1만 쓸 거라면 사실상 Glicko와 동격 수준의 정밀도)
- **Match Quality**: `q ∈ [0, 1]`. 1에 가까울수록 무승부 확률 높음 → "재미있는 매치" 정의
- **TrueSkill 2 추가**: partial play, draw margin, squad correlation, individual stat 활용 (팀 게임용 개선이라 1v1에는 영향 적음)
- **장점**: 가장 수학적으로 견고. 멀티팀/팀게임 확장이 자연스러움. 콜드스타트가 베이지안적으로 깔끔.
- **한계 (치명적)**:
  - **Microsoft 특허** + TrueSkill 상표권 → 상업적 사용 시 라이선스 필요. 인디는 사실상 회피 대상. (Wikipedia 명시)
  - 구현 난이도 매우 높음 (메시지 패싱 직접 구현 또는 sublee/trueskill 같은 라이브러리 의존)
  - 1v1만 쓸 거라면 Glicko-2 대비 차별점 거의 없음

### 2.4 OpenSkill (Weng-Lin)

- **출처**: Weng & Lin, "A Bayesian Approximation Method for Online Ranking", JMLR 2011 ([JMLR PDF](https://jmlr.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf)); OpenSkill: Joshy 2024 ([arXiv](https://arxiv.org/html/2401.05451v1), [openskill.py](https://github.com/vivekjoshy/openskill.py))
- **모델**: TrueSkill과 같은 베이지안 골격이지만, 메시지 패싱 대신 **closed-form 근사식**을 사용 → 계산 2.5~6.5배 빠름, JS 구현은 TrueSkill 대비 20배까지 빠름
- **모델 종류**: Plackett-Luce (권장 디폴트), Bradley-Terry-Full, Bradley-Terry-Partial, Thurstone-Mosteller (Full/Partial)
- **라이선스**: MIT — TrueSkill의 특허 회피 대안으로 정확히 설계됨
- **장점**: 1v1에서는 Bradley-Terry 모델로 떨어져 ELO와 매우 유사한 형태가 되며, 베이지안 분산 정보를 공짜로 얻음
- **한계**: 라이브러리 외 직접 구현은 여전히 비자명. 인디 1v1이라면 Glicko-2가 커뮤니티 자료가 더 많아 학습 비용 낮음

### 2.5 Bradley-Terry / Plackett-Luce

- **출처**: Bradley & Terry 1952; Luce 1959; Plackett 1975 ([Wikipedia](https://en.wikipedia.org/wiki/Bradley%E2%80%93Terry_model))
- **본질**: 각 항목에 잠재 strength λ 부여 → `P(i beats j) = λ_i / (λ_i + λ_j)`. ELO는 사실상 BT 모델의 로그 변환 + 온라인 SGD 학습.
- **Plackett-Luce**: BT를 리스트 비교(여러 등수)로 일반화. 1v1만 다룰 거라면 BT로 충분.
- **사용처**: 추천 시스템, 와인 비교, AI 모델 비교(LMSYS Chatbot Arena가 BT 사용). 1v1 게임에 직접 쓰는 사례는 드물지만 ELO/OpenSkill 이해에 필수 배경.

### 2.6 비교 표

| 알고리즘 | 수렴 속도 (신규 → 안정) | 분산/신뢰도 표현 | 계산 비용 (1판) | 구현 복잡도 | 1v1 적합도 | 라이선스 |
|---|---|---|---|---|---|---|
| **ELO (정적 K)** | 느림 (50~100판) | ✗ | O(1), ~5 LOC | ★ | ★★★★ | Public domain |
| **ELO (동적 K)** | 중간 (20~40판) | △ (K로 간접 표현) | O(1), ~15 LOC | ★★ | ★★★★★ | Public domain |
| **Glicko-2** | 빠름 (10~20판) | ✓ (RD, σ) | O(n), n=상대수 | ★★★ | ★★★★★ | Public domain |
| **Lichess Glicko-2 (분수 period)** | 빠름 + 즉시 표시 | ✓ | O(1) per match | ★★★ | ★★★★★ | Public domain (구현 GPL/AGPL) |
| **TrueSkill** | 매우 빠름 (5~10판) | ✓ (μ, σ) | O(n) factor graph | ★★★★★ | ★★★★ (1v1엔 과잉) | Microsoft 특허/상표 |
| **OpenSkill (Weng-Lin)** | 매우 빠름 | ✓ | O(n) closed-form | ★★★★ | ★★★★ | MIT |
| **Bradley-Terry** | 배치 학습 필요 | ✗ (별도 추정 필요) | 회귀 1회 | ★★ (배치) | ★★ (단판 부적합) | Public domain |

> **인디 1v1 권장 우선순위 (구현 난이도 vs 가치)**: 동적 K ELO → Lichess 식 Glicko-2 → OpenSkill → TrueSkill.

---

## 3. 실제 1v1 게임 사례

### 3.1 체스: FIDE / USCF / Chess.com / Lichess

- **FIDE**: ELO. K=40/20/10 가변. 신규 30판 미만은 K=40, < 2400은 K=20, ≥ 2400은 K=10. 18세 미만 < 2300은 K=40 유지. ([FIDE handbook](https://handbook.fide.com/))
- **USCF**: ELO 변형. "rating floor" 메커니즘 (한번 도달한 점수 아래로는 일정 폭 이상 안 내려감) → 부스팅/덤핑 방지.
- **Chess.com**: Glicko-1 사용 ("[Chess.com FAQ — Glicko ratings](https://support.chess.com/en/articles/8568123-what-is-glicko-and-how-does-it-work)"). Lichess와 달리 단판 즉시 업데이트가 아니라 일별 묶음 처리 일부 적용.
- **Lichess**: **Glicko-2를 분수 rating period로 변형**. 게임 끝날 때마다 즉시 업데이트, RD 시간감쇠 0.21436 periods/day, RD 최저 60. 시작 1500. 비활동 1년이면 RD 60→110. ([Lichess rating systems](https://lichess.org/page/rating-systems), [liglicko2](https://github.com/niklasf/liglicko2))
- **시사점**: 체스는 무승부가 흔해 모든 시스템이 0.5로 처리. 본 프로젝트(라운드 단위 KO)는 무승부가 거의 없으므로 표준 Glicko-2로 충분.

### 3.2 격투 게임: Tekken 8

- **표시 시스템**: 일본어 무도 등급 (Beginner → 1~9 Dan → Tenryu → ... → Tekken God Prime → True Tekken God). 시즌별 약간 변경.
- **알고리즘**: 공식 미공개. 데이터마이닝 + 공식 패치 노트로 추정 — **포인트 기반 + 등급 차이 가중**. 동급 승리 최소 400포인트, 상위 승리 시 가산. ([Bandai Namco patch 2.01 notes](https://www.bandainamcoent.com/news/tekken-8-ver-2-01-ranked-match-adjustment))
- **숨겨진 측정**: **Tekken Prowess** — 모든 캐릭터의 등급 합산 지표. 매칭 시 "랭크 + Tekken Prowess 가중 평균"을 사용한다고 공지. 이는 캐릭터별 별도 랭크가 있는 게임에서 스머프(고숙련 유저가 신캐 픽으로 저랭크 학살) 방지 장치.
- **승급전**: 일정 등급 이상에서 **단일 매치 승급/강등 모드**. 최근 시즌 2에서 "Red rank" 구간 3연승 보너스 도입.
- **시사점**: 등급 텍스트 + 내부 점수 분리 + 멀티 캐릭터 보정 사례.

### 3.3 격투 게임: Street Fighter 6

- **이원 구조**: **LP (League Points)** = Master 진입 전, **MR (Master Rate)** = Master 도달 후
- **LP**: 승리 LP > 패배 LP, Rookie~Gold는 3연승 시 보너스 (200+ LP/판 가능). 패배가 더 많아도 시간 들이면 Master 도달 가능 → 진입 친화적.
- **MR**: **명시적 ELO 변형**. 시작 1500. "이긴 쪽이 진 쪽 MR을 가져온다, 차이는 양 점수 격차 함수". ([Capcom Master 안내](https://www.streetfighter.com/6/buckler/information/detail/master20250205))
- **Phase 시스템**: 약 3개월 단위 시즌. **Phase 종료 시 Master Rate 부분 리셋** — 이전 Phase 점수 기반으로 1500 중앙값 부근에 재배치 (덜 친 사람만 1500). → 시즌 막판 점수 동결/덤핑 동기 제거.
- **시사점**: Master 진입 전후 알고리즘을 완전히 바꾼 가장 명확한 사례. 신규/저레벨에는 진입감을 주고, 고레벨에서 ELO로 정밀 측정.

### 3.4 격투 게임: Guilty Gear Strive

- **표시 시스템**: **Floor 1~10 + Celestial**. 로비 자체가 빌딩이고 층수가 등급.
- **알고리즘**: 1.48 패치 전까지는 "층 + 매치메이커"였으나, **1.48 (2024)에서 "Ranked Match" 모드 도입 + Rate Points** 시스템 추가. ([Shacknews 1.48](https://www.shacknews.com/article/145587/guilty-gear-strive-version-148-lucy-cyberpunk))
- **Celestial 진입**: "5판 중 5승"의 도전 모드 → 게임화된 승급 의식.
- **R-Code**: 캐릭터별 통계/배지 시스템. 캐릭터별 Floor 분리.
- **시사점**: "층 메타포"는 시각적 강력함 + 분명한 매칭 풀 분리. 하지만 층 간 격차가 너무 크면 부유 현상 발생 (커뮤니티 불만).

### 3.5 격투 게임: Mortal Kombat 1

- **Kombat League**: 9 tier (Apprentice → Elder God), 시즌제, **2/3판 셋트**.
- **시즌 보상**: 시즌 중 도달한 **최고 등급 기준** → 강등 두려움 완화.
- **시사점**: 셋트 단위 매칭이 단판 ELO 대비 분산을 줄인다. 본 프로젝트도 "best-of-3 ranked" 모드를 고려할 만함.

### 3.6 MOBA 1v1: League of Legends 1v1 이벤트 / Dota 2 솔로큐

- **LoL 1v1 모드**: 정식 랭크 없음. "Snowdown Showdown" 같은 한정 모드로만 존재.
- **Dota 2 솔로 MMR**: 솔로/파티 MMR 분리. 베이스는 ELO 변형이나 **신뢰도(uncertainty) 항** 보유. **스머프 탐지 시스템** 운영 중: 80~90% 승률 + 비정상적 GPM/XPM 패턴 감지 시 자동 MMR 인플레이트 ("자기 자리 찾을 때까지 강제 상승"). 전화번호 인증 + 랭크 큐 진입 100시간 요구. ([PCGamer Valve smurf](https://www.pcgamer.com/valve-cracks-down-on-dota-2-smurfs-with-mmr-changes/))
- **시사점**: "탐지된 스머프는 MMR을 빠르게 끌어올린다"는 패턴 — 인디 1v1에 적용 가능한 가장 단순한 안티 스머프.

### 3.7 MOBA: League of Legends (정식 솔로큐)

- **이원 구조**: **LP** (표시) + **MMR** (숨김)
- **MMR-LP 갭 보정 공식 (Riot Support)**:
  - MMR > Rank → 승리 LP 증가, 패배 LP 감소 ("위로 끌어당김")
  - MMR < Rank → 승리 LP 감소, 패배 LP 증가 ("아래로 끌어내림")
  - MMR == Rank → 승/패 LP 대칭 (~17~22 LP 영역)
- **승급전**: Diamond 이하는 100 LP 도달 후 Bo3 (디비전 승급) 또는 Bo5 (티어 승급). Master 이상은 LP 무한 누적.
- **강등 보호**: 승급 직후 ~3판 demotion shield. 티어 승급 후 ~10판.
- **시즌 리셋**: 소프트 리셋 (전 시즌 MMR을 기반으로 새 시즌 시작 위치 결정). ([Riot LP/MMR 공식](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/4405781372051-MMR-Rank-and-LP), [Promotions/Series/Decay](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/4405783687443))
- **시사점**: 표시/숨김 분리 디자인의 정전(canon).

### 3.8 FPS: Valorant

- **이원 구조**: **RR (Rank Rating)** + **MMR**. 디비전당 100 RR.
- **RR 영향 요인**: (1) 승/패 (지배적), (2) 라운드 격차 (proxy for skill gap), (3) 기존 MMR과 표시 랭크의 차이.
- **승급 후 안전망**: 디모트 직전 50 RR 부근에서 보정 (내려도 다른 디비전 50으로 복귀).
- **콜드스타트**: 5판 placement → 시작 등급 결정. 시즌 리셋 시 1~6 디비전 정도 후퇴 (소프트 리셋).
- **자동 스머프 탐지**: 2022년 도입. 헤드샷%, 반응 속도, 무브먼트 패턴 ML 분석. 신규 스머프 정착 시간이 2~3배 빨라짐. ([Valorant RR docs](https://support-valorant.riotgames.com/hc/en-us/articles/20113235347347))
- **시사점**: RR 변동을 둘러싼 라운드 격차/팀 평균 MMR 영향 등 "공정해 보이는" 부가 변수가 UX 신뢰의 핵심.

### 3.9 FPS: CS2 Premier (CS:GO 후속)

- **CS Rating**: **Glicko-2 변형**으로 알려져 있으나 정확한 공식은 비공개 (Valve). 점수 5자리. ([CS.money 분석](https://cs.money/blog/esports/what-is-glicko-rating-secrets-of-mm-rating/))
- **공식 카테고리(상위 1%, 5% 등)** + **점수**의 이원 구조.
- **시즌 리셋**: 매 6개월 부분 리셋 + 점수 인플레이션 패치 (Valve가 의도적으로 평균 점수를 높여 표시).
- **시사점**: Glicko-2 + 비공개 부스트 = 불투명도가 부정행위 방지에는 도움이 되지만 커뮤니티 불만의 원천이 됨.

### 3.10 FPS: Overwatch (개편 전후)

- **개편 전 (OW1)**: SR (Skill Rating) 표시. 내부 MMR과 사실상 동일.
- **Jeff Kaplan 발언 (2018)**: "SR은 매칭에 안 쓰임. 우리는 항상 MMR만 본다." → 사실상 SR도 표시용 변환층. ([PCGamesN Kaplan](https://www.pcgamesn.com/overwatch/sr-decay))
- **개편 후 (OW2)**: 7판 묶음 단위로 등급 변동 표시 → "한 판 영향 줄이기" 시도였지만 커뮤니티 반발로 회귀 일부.
- **시사점**: 너무 강한 추상화(7판 묶음)는 즉시성을 잃어 동기 부여를 깎는다.

### 3.11 RTS: StarCraft 2

- **MMR**: TrueSkill 계열로 추정 (Blizzard 비공식 인터뷰). 가시화 (3.4.0 패치 이후). σ 명시적 보유.
- **Bonus Pool**: 비활동 시 누적, 다음 승리 시 추가 점수 → 활동 장려.
- **리그/디비전**: Bronze~Grandmaster + 디비전. 디비전 = 100명 단위 그룹 (자체 리더보드). ([Liquipedia Battle.net Leagues](https://liquipedia.net/starcraft2/Battle.net_Leagues))
- **시사점**: 디비전 = "지인 리그" 효과. 100명 규모면 친밀감 있는 지속 동기 부여 가능.

### 3.12 카드: Hearthstone

- **레전드 진입 전**: "별 시스템" + 연승 보너스. 사실상 진입 친화 LP 모델.
- **레전드 진입 후**: **Hidden MMR** 기반 등수 (#1, #2, ... #10000+). 등수 변동 = MMR 변동의 시각화.
- **시사점**: 캐주얼/하드코어를 등급/MMR로 자연스럽게 분리. SF6 LP/MR과 동일한 구조.

### 3.13 퍼즐: TETR.IO TETRA LEAGUE

- **알고리즘**: **Glicko-2**. TR (Tetra Rating) 표시, RD/Volatility 명시적 노출.
- **콜드스타트**: 10판 "rating games" 후 TR 표시. 그 전엔 비공개.
- **레터 등급**: RD < 100 + 백분위 기반 D~X+ 등급 부여.
- **RD 동작**: 정기 플레이 시 58 하한, 1주 비활동 후 시간당 1RD/일 증가, 350 상한. ([TETR.IO Wiki](https://tetrio.wiki.gg/wiki/TETRA_LEAGUE))
- **시사점**: **Glicko-2 + 백분위 등급**의 가장 깔끔한 1v1 인디 사례. 본 프로젝트와 인구 규모가 비슷한 시기(2020년 출시 초기 수천 명)에 안정적으로 운영된 모범.

---

## 4. 표시 점수 vs 숨겨진 MMR

### 4.1 왜 분리하는가
1. **심리적 보상 곡선 분리**: MMR은 0-sum이라 재미 없음. 표시 점수는 디비전/티어 진행감 + 연승 보너스로 변형 가능.
2. **매칭 정확도 분리**: 매칭은 MMR로 → 항상 정밀 매칭. 표시는 "지난 승급 이후 누적" 같은 게임화 가능.
3. **시즌 리셋 자유도**: MMR은 작게 리셋, 표시 점수는 크게 리셋해서 "다시 도전" 동기 부여.
4. **부스팅 회복력**: 부스팅으로 표시만 올라가도 MMR이 그대로면 다음 매칭에서 자연스럽게 복귀.

### 4.2 LP 가감 공식 (LoL/Valorant 사례)

```
LP_gain = base_LP * f(MMR - tier_target_MMR)
LP_loss = base_LP * g(tier_target_MMR - MMR)
```

- `base_LP`: ~17~22 (LoL 디비전 ≈ 100 LP, 디비전 승급 ~5판 가정)
- `f`, `g`: 시그모이드 형태. 격차가 크면 1.5~2배까지 부풀림/축소.
- 동일 MMR이면 승=+19, 패=-18 정도로 약간 비대칭 (표시 점수 인플레이션 의도).

### 4.3 콜드스타트 처리 비교

| 게임 | 초기 분산 처리 |
|---|---|
| Lichess (Glicko-2) | RD=350으로 시작, 게임마다 자동 수렴 (배치 placement 없음) |
| TETR.IO | 10판 rating games 동안 점수 비표시 |
| Valorant | 5판 placement 후 시작 등급 + RR 결정 |
| LoL | 10판 placement (현재는 단축, 시즌 첫 진입 시 약간) |
| SF6 | Rookie 시작, LP 누적식 — placement 별도 없음 |
| Tekken 8 | Beginner 시작, 자동 등급 추적 — placement 없음 |

**인디 권장**: "5~10판 비표시 + RD 자동 수렴" (Lichess + TETR.IO 혼합)이 코드 복잡도 최소이며 신규 진입 마찰 가장 낮음.

### 4.4 스머프와 부스팅 대응

- **MMR 부스팅 감지**: 같은 IP/디바이스/세션 패턴. 단기 100% 승률.
- **스머프 자동 보정 (Riot/Valve 방식)**: 비정상적 게임 내 통계 + 연승 → MMR 강제 가속. 인디는 "신규 7연승 시 K-factor × 3" 같은 단순 규칙으로 80% 효과.
- **파견 보스팅 대응**: 게임 내 행동 지문 (입력 패턴, 무브먼트) ML 분류. 인디 단계에서는 부담스러우니 "신고 기반 + 수동 검토"가 현실적.

---

## 5. 매칭 품질 · 대기 시간 트레이드오프

### 5.1 핵심 메트릭

- **TrueSkill quality(A, B)**: `q ∈ [0, 1]`, 무승부 확률 ≈ 매치의 재미 proxy
- **Glicko-2 매칭 윈도우**: 일반적으로 `|r_A - r_B| < k × sqrt(RD_A^2 + RD_B^2)` (k ≈ 1~2)
- **ELO 매칭 윈도우**: 단순 점수 차 < threshold (예: ±100). 시간 지나면 widening.

### 5.2 Widening 알고리즘 (Riot/AWS 사례)

```
t < 45s   → ±100 LP
t < 75s   → ±200 LP
t < 120s  → ±400 LP
t > 120s  → ±무제한, 가장 가까운 매치
```

### 5.3 저인구 풀의 현실

- 신생 인디 1v1에서 "동시 접속 100명 미만"은 일상. 이때 매칭 품질을 강제하면 90초 대기 → 90% 이탈.
- **현실적 트릭**:
  1. **봇 채우기**: 60초 후에도 매치 못 잡으면 NPC 봇과 매치 (랭크에는 반영 안 함). 본 프로젝트의 "Solo bot" 모드와 동일 구조.
  2. **예약 매치**: 큐를 시간대별로 모아 "30분마다 라운드" 방식 (Tetris 토너먼트, NAF 블러드볼 등이 사용)
  3. **친구/지인 매치**: 비공개방으로 간이 도전. 본 프로젝트 P1으로 검토 대상.

### 5.4 "강제 50% 승률" 논란과 EOMM

- **사실**: TrueSkill/Glicko가 정밀하면 비슷한 실력 매칭 → **자연스럽게 50% 수렴**. 강제가 아님.
- **주의 사항**: EOMM (EA 2017 논문, [arXiv 1702.06820](https://arxiv.org/pdf/1702.06820))은 매치 결과 자체를 의도적으로 조작해 engagement 최적화 — **공정성보다 이탈률 최적화**. 인디가 도입하면 신뢰 붕괴 위험. 추천하지 않음.
- **진짜 위험**: "표시 점수가 잘 안 오른다"는 인식. → MMR-Rank 갭 보정은 **항상 투명하게 안내**할 것.

---

## 6. 부정행위 / 어뷰징 방지

### 6.1 큐 회피 (Dodge) / AFK

- **Dodge 패널티 (LoL)**: 첫 도지 -3 LP + 6분 큐 락. 두번째 -10 LP + 30분 락. 24시간마다 리셋.
- **AFK 패널티**: 시즌 누적 → 큐 락 + 보상 박탈.
- **인디 권장 (MVP)**: "큐 매칭 후 10초 내 미입장 → -10 LP". 도지 detection은 거의 1줄.

### 6.2 의도적 패배 (Throwing) / Smurf

- **탐지 신호**:
  - 비정상적 단기 승률 (95%+)
  - 계정 신생 + 고숙련 입력 패턴
  - 같은 디바이스에서 다중 계정
  - 첫 5분 KDA 평균 대비 표준편차
- **인디 1v1 권장 1차 방어**: 신규 계정 7판 강제 K=3배 → 진짜 실력으로 빠르게 수렴. 95% 효과 무료.

### 6.3 시즌 막판 동결 / 비활동 보호

- **SF6 방식**: Phase 종료 시 부분 리셋. "지키려는 동기"를 시간으로 자연 해소.
- **LoL 방식**: 시즌 끝나기 1주일 전 보상 확정. 그 이후는 비공식 캐주얼.
- **인디 권장**: 시즌 라스트 24시간은 매치 결과를 표시는 하되 LP 이동 ±5 한계.

---

## 7. UX · 게임 디자인 패턴

### 7.1 티어 시각화

- **메달/배지** (LoL, Valorant): 디지털 우상 효과. 비싼 시각 자산이 가장 큰 효과.
- **층/계단** (Strive, Tekken): 공간 메타포. 빌딩/탑 컨셉이 "승급" 직관 강력.
- **별** (Hearthstone): 진입 친화. 레전드 진입 전까지 별 단위 LP.
- **단순 숫자** (체스, TETR.IO): 정확하지만 dry. 핵심 사용자 외엔 동기 약함.

### 7.2 승급/강등 심리

- **Promotion Series (Bo3/Bo5)**: 승급 의식. 단점은 "한 판 핑계" 발생 → 승급률 계산이 복잡해짐.
- **Demotion Shield**: 승급 직후 강등 방지 (LoL 3판, Marvel Rivals "Chrono Shield" 등). 랭크 불안 감소 + ranked 진입 의지 증가의 명확한 효과.
- **단판 승급 (Tekken 고등급)**: 도파민 강력. 강등 두려움도 강력 → ranked 회피로 이어질 수 있음. 양날.

### 7.3 시즌 보상 구조

- **방어형** (도달 등급 기준 보상, MK1): "올라가도 안 떨어뜨리려" 노력. 시즌 막판 큐 회피 발생.
- **진취형** (시즌 종료 시점 등급 기준, LoL 일부 시즌): 끝까지 도전. 부담 증가.
- **혼합형** (대부분의 현대 게임): 보상은 시즌 중 최고 기준, 등급은 시즌 종료 기준 표시.

### 7.4 랭크 불안 완화 UI

- **상대 등급 숨김** (몇몇 격투 게임 옵션): 캐주얼 모드 향. 본질적 매칭은 동일.
- **점수 변동 즉시성**: 매치 종료 직후 +X LP 애니메이션. 8단계로 분해해 도파민 자극.
- **MMR 표시 vs 숨김**: 게임 디자이너 사이 가장 논란 많은 결정. 일반적으로 **숨기는 쪽이 신규 마찰 낮음**, 코어 유저는 외부 사이트로 추정 (Riot OP.GG 사례).

---

## 8. Chambara Duel 권장 구성

### 8.1 환경 제약 정리

| 제약 | 영향 |
|---|---|
| Cloudflare Workers + DO | 싱글 라이터 보장 → 락 없는 원자 업데이트 자명. cron triggered DO로 rating period 처리 가능 |
| 잼 마감 = 5월 1일 | Phase 1은 "있는 ELO 유지", 신규 알고리즘은 잼 후 |
| 누적 활성 인구 = ?? (예측 < 1000) | TrueSkill 과잉, Glicko-2 적정, ELO 동적 K도 무난 |
| 모노레포 + TS strict, shared/combat 결정론 요구 | 알고리즘 코드는 `shared/src/rating/`에 순수 함수로 |
| 1v1 only, 무승부 거의 없음 | draw 처리 단순 (S = 1 또는 0) |
| 캐릭터/검 픽 시스템 존재 | Tekken Prowess류 캐릭터별 보정은 P2 (잼 직후 불필요) |

### 8.2 단계별 권장

#### Phase A: 잼 마감 직후 (~2026-05-07, 첫 1주)
**현행 ELO K=32 유지하되 다음 5가지만 패치**:
1. **신규 K-factor 가속**: 첫 7경기 K = 64 (FIDE 신규 K=40 패턴 차용). 콜드스타트 수렴 2배.
2. **점수 클램핑**: 점수 < 100 또는 > 3000 방지. 이상치 안전망.
3. **큐 widening**: t < 30s ±50, t < 60s ±150, t < 90s ±무제한, 90s 이후 봇 매치 옵션 제시.
4. **Dodge -10 LP**: 큐 매치 후 10초 미입장 = 패배 처리.
5. **표시 등급 텍스트만 추가**: ELO 점수 → "Steel/Iron/Bronze/Silver/Gold/Platinum/Master" 6티어 (배지 없이 텍스트만). 코드 30줄.

이 단계까지는 **표시 점수와 숨겨진 MMR 분리하지 않는다**. 인구가 너무 적어 분리의 가치 < 구현 비용.

#### Phase B: 잼 후 1개월 (활성 인구 100~500 가정)
**Glicko-2 단판 업데이트로 마이그레이션 (Lichess 방식)**:
1. `shared/src/rating/glicko2.ts`에 instant-glicko-2 패턴 구현 (~150 LOC). 라이선스 안전한 [niklasf/liglicko2](https://github.com/niklasf/liglicko2) 참고.
2. 초기값: r=1500, RD=350, σ=0.06, τ=0.5, RD 하한 60.
3. 비활동 시 RD 시간 보정: Lichess의 0.21436 periods/day 채택 (1년에 60→110).
4. 매칭 윈도우: `|r_A - r_B| < 1.5 × sqrt(RD_A² + RD_B²)`, 30초마다 1.5배씩 widening.
5. Cloudflare DO 패턴: **Player DO 단위로 (r, RD, σ, lastUpdated) 보관**. RankedQueue DO가 매치 종료 시 양 Player DO에 RPC로 단판 업데이트 호출. **Rating period는 사실상 불필요** (분수 period 즉시 적용).
6. **마이그레이션**: 기존 ELO 점수 r_old → Glicko-2 r=r_old, RD=200(기존 활성 유저), RD=350(신규).

#### Phase C: 정식 운영 (활성 인구 500+ 안정)
1. **표시 점수 / 숨김 MMR 분리**: 표시 = LP(0-100 디비전 × 7 티어). 내부 MMR = Glicko-2 r.
2. **LP 가감 공식**: base 20 ± 8 (격차 함수), MMR > 표시 등급 → +25/-15, MMR < 표시 → +15/-25. LoL 패턴.
3. **시즌 (3개월)**: SF6 Phase 방식 — 부분 리셋. 새 시즌 r = (이전 r × 0.7 + 1500 × 0.3), RD reset to 200.
4. **Demotion Shield**: 티어 승급 직후 5경기 강등 방지.
5. **신규 7연승 자동 K 가속**: 명시적 스머프 보정.
6. **Best-of-3 모드 (선택)**: MK1 패턴. 단판보다 분산 작아 정밀 매칭 가능.
7. **소프트 anti-cheat**: 신고 누적 + 같은 디바이스 다중 계정 감지. 자동 보정은 "탐지 시 K × 3"만.

### 8.3 명시적으로 도입하지 않을 것

- **TrueSkill / TrueSkill 2**: 1v1만 있으면 Glicko-2 대비 차별화 없음 + 특허 위험.
- **EOMM 류 engagement 최적화**: 신뢰 붕괴 위험, 인디 규모에서 ROI 낮음.
- **승급전 Bo3/Bo5**: MVP에선 단순 100 LP 컷오프로 충분. 코어 유저 5000+ 시 검토.
- **캐릭터별 분리 랭크 (Strive R-Code 식)**: 캐릭터/무기 픽 다양성이 적은 잼 빌드에선 가치 < 비용.
- **자동 ML 스머프 탐지**: 인디 단계 ROI 매우 낮음. 신고 + 7연승 K 가속만.

### 8.4 핵심 결론 5줄

1. **잼 직후 1주는 현행 ELO K=32 유지 + 신규 K=64 가속 + 큐 widening + dodge 패널티 + 6티어 텍스트만 추가**해도 코드 100줄 미만에 80% 효과를 본다.
2. **활성 인구 100명 넘어가는 시점부터 Lichess 식 분수 period Glicko-2로 마이그레이션** — Cloudflare Durable Objects의 싱글 라이터 보장이 구현 부담을 평소의 절반으로 떨어뜨린다.
3. **표시 점수(LP) / 숨겨진 MMR(Glicko-2 r) 분리는 활성 인구 500+ 시점에 도입**하면 충분 — 그 전엔 분리의 가치보다 구현/문서화 비용이 크다.
4. **TrueSkill은 1v1 only 환경에서는 명백히 과잉이며, Microsoft 특허 회피만으로도 OpenSkill 또는 Glicko-2가 정답**. 자료/커뮤니티 풍부함을 고려하면 인디 학습 비용은 Glicko-2 < OpenSkill.
5. **부정행위 방지의 ROI 1순위는 "신규 7연승 시 K 가속"** — 단순 30줄로 스머프의 80%를 자기 자리로 보낸다. ML 탐지·EOMM·자동 보스팅 검출은 코어 유저 5000+ 시점까지 미루는 것이 합리적.

---

## 9. 참고 문헌

### 9.1 1차 알고리즘 출처 (신뢰도: 높음)

| 출처 | 종류 | URL | 신뢰도 |
|---|---|---|---|
| Glickman, M. — Glicko 원논문 | Academic PDF | http://www.glicko.net/glicko/glicko.pdf | 1차, 매우 높음 |
| Glickman, M. — Glicko-2 Example | Academic PDF | https://glicko.net/glicko/glicko2.pdf | 1차, 매우 높음 |
| Herbrich, Minka, Graepel — TrueSkill | NeurIPS PDF | http://papers.neurips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system.pdf | 1차, 매우 높음 |
| Minka et al. — TrueSkill 2 (2018) | Microsoft PDF | https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/trueskill2.pdf | 1차, 매우 높음 |
| Weng & Lin — Bayesian Online Ranking | JMLR PDF | https://jmlr.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf | 1차, 매우 높음 |
| OpenSkill — Joshy 2024 | arXiv | https://arxiv.org/html/2401.05451v1 | 1차, 높음 |
| Chen et al. — EOMM | WWW 2017 PDF | https://arxiv.org/pdf/1702.06820 | 1차, 매우 높음 |
| Bradley-Terry model | Wikipedia | https://en.wikipedia.org/wiki/Bradley%E2%80%93Terry_model | 백과, 중간 |

### 9.2 게임 공식 출처 (신뢰도: 높음)

| 출처 | URL | 신뢰도 |
|---|---|---|
| FIDE Rating Calculator | https://ratings.fide.com/calc.phtml?page=change | 공식, 매우 높음 |
| Lichess — Chess rating systems | https://lichess.org/page/rating-systems | 공식, 매우 높음 |
| Capcom — SF6 Master League notice | https://www.streetfighter.com/6/buckler/information/detail/master20250205 | 공식, 매우 높음 |
| Bandai Namco — Tekken 8 patch 2.01 | https://www.bandainamcoent.com/news/tekken-8-ver-2-01-ranked-match-adjustment | 공식, 매우 높음 |
| Riot — MMR, Rank, and LP | https://support-leagueoflegends.riotgames.com/hc/en-us/articles/4405781372051 | 공식, 매우 높음 |
| Riot — Promotions/Series/Decay | https://support-leagueoflegends.riotgames.com/hc/en-us/articles/4405783687443 | 공식, 매우 높음 |
| Riot — Ask Valorant: RR Edition | https://playvalorant.com/en-us/news/dev/ask-valorant-rank-rating-edition/ | 공식, 매우 높음 |
| Riot — Valorant How RR Is Calculated | https://support-valorant.riotgames.com/hc/en-us/articles/20113235347347 | 공식, 매우 높음 |
| Arc System Works — Strive Online | https://www.guiltygear.com/ggst/en/howto/online/ | 공식, 높음 |
| WB — MK1 Kombat League Guide | https://mortalkombatgamessupport.wbgames.com/hc/en-us/articles/360029784753-Kombat-League-Guide | 공식, 높음 |
| TETR.IO Wiki — TETRA LEAGUE | https://tetrio.wiki.gg/wiki/TETRA_LEAGUE | 비공식 wiki(개발자 커뮤니티), 높음 |
| Liquipedia — SC2 Battle.net Leagues | https://liquipedia.net/starcraft2/Battle.net_Leagues | 커뮤니티 위키, 높음 |
| PCGamesN — Kaplan SR decay | https://www.pcgamesn.com/overwatch/sr-decay | 인터뷰 중계, 중간 |
| PC Gamer — Valve smurf | https://www.pcgamer.com/valve-cracks-down-on-dota-2-smurfs-with-mmr-changes/ | 보도, 중간 |
| Shacknews — GG Strive 1.48 | https://www.shacknews.com/article/145587/guilty-gear-strive-version-148-lucy-cyberpunk | 보도, 중간 |

### 9.3 구현/오픈소스 (신뢰도: 높음)

| 프로젝트 | URL | 비고 |
|---|---|---|
| niklasf/liglicko2 (Rust, Lichess 식) | https://github.com/niklasf/liglicko2 | 분수 rating period 참고 모델 |
| gpluscb/instant-glicko-2 (Rust) | https://github.com/gpluscb/instant-glicko-2 | 단판 즉시 업데이트 |
| gpluscb — "So You Want to Use Glicko-2" gist | https://gist.github.com/gpluscb/302d6b71a8d0fe9f4350d45bc828f802 | 실무 가이드 |
| sublee/trueskill (Python) | https://github.com/sublee/trueskill | TrueSkill 표준 구현 |
| vivekjoshy/openskill.py | https://github.com/vivekjoshy/openskill.py | MIT, 활발한 유지보수 |
| scttcper/ts-trueskill | https://github.com/scttcper/ts-trueskill | TS 포팅 |
| mmai/glicko2js | https://github.com/mmai/glicko2js | 노드 표준 구현 |

### 9.4 인프라 출처 (신뢰도: 매우 높음)

| 출처 | URL |
|---|---|
| Cloudflare — Durable Objects Overview | https://developers.cloudflare.com/durable-objects/ |
| Cloudflare — Rules of Durable Objects | https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/ |
| Cloudflare — Control/data plane pattern | https://developers.cloudflare.com/reference-architecture/diagrams/storage/durable-object-control-data-plane-pattern/ |
| AWS — Matchmaking wait vs quality | https://aws.amazon.com/blogs/gametech/questions-of-matchmaking/ |

### 9.5 추정/커뮤니티 출처 (신뢰도: 중간 — 보고서 본문에 "커뮤니티 추정"으로 명시)

- SF6 MR 정확한 계수: 커뮤니티 데이터마이닝 추정. Capcom 공식은 "ELO-style, 1500 시작, 격차에 따라 변동"까지만 공개.
- CS2 Premier 정확한 Glicko-2 변형: Valve 비공개. cs.money/GGWP 등의 분석은 추정.
- Tekken Prowess 정확한 가중: Bandai Namco 비공식. esports.gg/PhiDX 분석 기반.
- Dota 2 솔로 MMR 정확한 σ 동작: Valve 비공개. dotabuff/PCGamer 보도 기반 추정.
- Hearthstone Legend Hidden MMR: Blizzard 비공개. 커뮤니티 포럼 합의 기반 정성적 설명.

### 9.6 보조 자료 (신뢰도: 중간~낮음, 본문 직접 인용 안 함)

- 부스팅 사이트(Boosteria, ElofactoryGG 등) 가이드: 출처 검증 어려움, 정성적 참고만.
- Reddit/Steam Community 토론: 사용자 인식 파악용으로만 사용.
- Wikipedia (Elo, TrueSkill, Glicko, Bradley-Terry): 일관된 백과 기술, 1차 출처와 교차 검증.

---

## 부록 A. Glicko-2 단판 업데이트 의사 코드 (Lichess 식)

```typescript
// shared/src/rating/glicko2.ts (개념 의사 코드, ~80 LOC 풀구현 가능)

const SCALE = 173.7178; // Glicko-2 → Glicko 스케일
const TAU = 0.5;
const RD_MIN = 60;
const RD_MAX = 350;
const PERIODS_PER_DAY = 0.21436; // Lichess 튜닝값

interface RatingState {
  r: number;     // ELO-scale rating (default 1500)
  rd: number;    // rating deviation (default 350)
  sigma: number; // volatility (default 0.06)
  lastUpdate: number; // unix ms
}

function updateRating(self: RatingState, opp: RatingState, score: 0 | 0.5 | 1, now: number): RatingState {
  // 1. 시간 보정 RD inflation
  const dtDays = (now - self.lastUpdate) / 86400_000;
  const periods = dtDays * PERIODS_PER_DAY;
  const phi = (self.rd) / SCALE;
  const phiInflated = Math.sqrt(phi*phi + periods * self.sigma*self.sigma);

  // 2. 표준 Glicko-2 한 단계 (단일 상대)
  const mu = (self.r - 1500) / SCALE;
  const muOpp = (opp.r - 1500) / SCALE;
  const phiOpp = opp.rd / SCALE;
  const g = 1 / Math.sqrt(1 + 3*phiOpp*phiOpp / (Math.PI*Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muOpp)));
  const v = 1 / (g*g * E * (1 - E));
  const delta = v * g * (score - E);

  // 3. volatility 업데이트 (Newton-Raphson, ~10 LOC)
  const newSigma = updateVolatility(self.sigma, delta, phiInflated, v, TAU);
  const phiStar = Math.sqrt(phiInflated*phiInflated + newSigma*newSigma);
  const newPhi = 1 / Math.sqrt(1/(phiStar*phiStar) + 1/v);
  const newMu = mu + newPhi*newPhi * g * (score - E);

  // 4. 스케일 환원 + 클램핑
  const newR = newMu * SCALE + 1500;
  const newRd = Math.max(RD_MIN, Math.min(RD_MAX, newPhi * SCALE));

  return { r: newR, rd: newRd, sigma: newSigma, lastUpdate: now };
}
```

> Cloudflare Player DO에서 위 함수를 RPC로 호출만 하면 끝. 락 없음, 큐 없음, rating period batch 없음.

## 부록 B. 권장 매칭 윈도우 의사 코드

```typescript
function matchWindow(self: RatingState, waitMs: number): number {
  const baseRD = Math.sqrt(self.rd*self.rd + 200*200); // 가상 상대 RD 200 가정
  const widening = 1 + Math.floor(waitMs / 30_000) * 0.5;
  return 1.5 * baseRD * widening; // ±이 값 안의 상대만 매칭
}
```

## 부록 C. 시즌 부분 리셋 공식 (SF6 Phase 차용)

```typescript
function seasonReset(state: RatingState): RatingState {
  return {
    r: state.r * 0.7 + 1500 * 0.3, // 평균으로 30% 회귀
    rd: Math.max(state.rd, 200),    // RD를 다시 풀어줌
    sigma: state.sigma,
    lastUpdate: Date.now(),
  };
}
```

---

**Open questions / 후속 검토 필요**:
1. 캐릭터/검 픽이 의미 있는 다양성을 가질 경우 Tekken Prowess 같은 캐릭터별 보정이 필요한지 — 인구 5000+ 시점에 데이터 기반 재검토.
2. 모바일 클라이언트 추가 시 입력 차이로 인한 별도 큐 분리 여부 — 본 보고서 범위 외.
3. Glicko-2 τ(volatility) 튜닝값: 격투/액션은 0.3~0.6 권장이나 본 게임 결과 분포 확인 후 A/B 추천.
4. 시즌 종료 시점 봇 가격 동결 정책의 구체 수치 — 운영 데이터 수집 후 결정.
