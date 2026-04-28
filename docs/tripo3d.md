# Tripo3D × Vibe Jam 2026 활용 가이드

> 2026-04-28 조사. Tripo3D 공식 사이트, Tripo API 문서, @tripoai / @levelsio 트윗, 비교 매체(3DAI Studio, Medium, lorphic).

## 1. 서비스 개요

**Tripo3D** (`tripo3d.ai`, API는 `platform.tripo3d.ai`) — 텍스트 / 이미지 → 3D 메시 AI 생성.

| 항목 | 내용 |
| --- | --- |
| 입력 | 텍스트, 단일 이미지, 멀티뷰, 두들 스케치 |
| 출력 포맷 | **GLB**, FBX, OBJ, USD, STL, 3MF, Schematic |
| 캐릭터 | 인간/동물/사물 모두 가능, **T-pose 자동 정렬 옵션** |
| 리깅 | **AI Auto Rigging 내장** + Mixamo 호환 FBX 출력 |
| 품질 | 최대 500K 폴리, 4K PBR 텍스처, Quad remesh, Smart Low-poly |
| 생성 시간 | 표준 ~20초, Smart Mesh ~2초, 텍스처 포함 30-60초 |
| 백본 | 200B+ 파라미터 |

## 2. Vibe Jam 2026 위상

**Silver 스폰서** (Diamond: Cursor, Gold: Bolt.new, Silver: Glif + **Tripo3D**).

### 잼 전용 혜택 — 공식 명시 없음

잼 페이지 / @tripoai / @levelsio 어디에서도 "참가자 전용 크레딧 / 프로모 코드 / 스폰서 상금"이 **공식적으로 명시되어 있지 않음**.

**그러나** Tripo는 직전 자체 잼(Tripo 3D Game Jam: Portal Pass, 1/25-2/9, GDC 2026 쇼케이스, 상금 $16K+) 에서 신청 폼으로 무료 크레딧을 분배한 전례가 있음. 본 잼 참가자는 **@tripoai DM 또는 Discord 로 직접 크레딧 요청** 가치 매우 높음.

## 3. 요금제

| 플랜 | 월 (40% 할인 시 연) | 월 크레딧 | 동시 작업 | 상업 사용 |
| --- | --- | --- | --- | --- |
| Basic | $0 | 300 | 1 | 제한 |
| **Professional** | **$11.94 / $143.28** | **3,000** | **10** | **가능** |
| Advanced | $29.94 / $359.28 | 8,000 | 15 | 가능 |
| Premium | $83.94 / $1,007.28 | 25,000 | 20 | 가능 |

- Basic 300 크레딧 ≈ 표준 모델 15개. 잼 한 편 분량으로 부족.
- **Professional 부터 상업 사용 + 프라이빗 모델** → 잼 출품작에 텍스처째 포함하려면 사실상 필수.

### 크레딧 비용 (참고)

- v3.0/v3.1 표준 = 20 cr
- P1 text-to-3D = 60 cr
- P1 image-to-3D = 80 cr
- 텍스처 / 리깅 / 리파인 옵션 별도 가산
- 실패 시 자동 환불

## 4. API / 통합

- **엔드포인트**:
  - `POST https://api.tripo3d.ai/v2/openapi/task` — 작업 제출
  - `GET /v2/openapi/task/{task_id}` — 상태 폴링
- **인증**: `Authorization: Bearer tsk_...` 헤더
- **CORS**: 공식 문서 미확인 → **백엔드 프록시 필수 가정**으로 설계 권장
- **비동기 패턴**: 제출 → task_id 즉시 반환 → 폴링 → `output.model` URL → GLB/FBX 다운로드
- **레이트**: Basic 1 / Pro 10 / Advanced 15 동시
- **공식 플러그인**: Blender, Unity, Unreal, Godot, Cocos, ComfyUI

### 본 프로젝트 적용 시

이미 우리 서버(`@vibejam/server`)가 존재하므로 그 위에 `/api/generate` 같은 프록시 라우트를 만들면 완벽:
1. 클라가 단어/프롬프트 전송
2. 서버가 Tripo API 호출 + API 키 보호
3. 폴링은 서버에서, 결과 GLB URL을 클라로 푸시
4. 클라는 `useGLTF(receivedURL)` 로 즉시 로드

## 5. 품질 / 경쟁사

| 서비스 | 강점 | 약점 |
| --- | --- | --- |
| **Tripo3D** | Quad 토폴로지, 빠른 생성, 게임엔진 친화, T-pose+Auto Rigging+Mixamo 통합 | 포토리얼 텍스처는 Rodin Gen-2 에 밀림 |
| Meshy | 3D 프린팅 1위, 캐릭터 품질 비등 | 토폴로지 약간 거침 |
| Rodin Gen-2 | 시각 품질 최상 (10B 파라미터) | 게임 런타임에 무거움 |
| Luma Genie / Spline AI | 진입 쉬움 | 게임용 토폴로지 미흡 |

### 잘 되는 입력
- 단일 캐릭터 / 동물 / 소품
- 카툰·스타일라이즈드, 스팀펑크, LEGO·복셀

### 약한 입력
- 사람 군중
- 복잡한 기계 내부
- 투명/반사 재질
- 텍스트가 새겨진 표면

## 6. 활용 패턴 (3가지)

| 패턴 | 비용 | 지연 | 적합한 게임 |
| --- | --- | --- | --- |
| **사전 생성 풀** | 1회성 | 0 | 캐릭터/소품 30-50개 정적 번들 — 보통 잼은 이걸로 충분 |
| **런타임 동적 생성** | 호출당 ~$0.05-0.15 | 20-60초 | 메카닉 핵심이 "단어→3D" 일 때만 |
| **하이브리드** | Pro 1개월 + 약간의 호출 | 사전부분 0, 런타임만 30-60초 | 핵심 에셋은 사전, 시그니처 메카닉만 런타임 |

## 7. 가성비 최고 활용 전략

**하이브리드 + Pro $11.94/월 1개월 결제** 가 가성비 최고:

1. **Basic 300 크레딧은 잼 1편에 부족 + 라이선스 애매** → Pro 가 사실상 베이스라인
2. **마감 1주 전까지 80% 사전 생성** → GLB 정적 번들로 고정 (런타임 폴링 실패 리스크 0)
3. **나머지 20%만 시그니처 메카닉 (예: "플레이어가 입력한 단어로 적/소품 즉석 생성")** 에 런타임 API 사용 → 화제성 + 스폰서 셔우트아웃
4. **Tripo T-pose FBX → Mixamo 자동 리깅 → 모션팩** 파이프라인으로 애니메이션 추가 비용 0
5. **@tripoai 에 잼 참가자 DM** — 비공식 추가 크레딧 가능성 충분

## 8. 본 프로젝트 통합 시점

현재 스캐폴드(`@vibejam/server` 가 이미 Express + Colyseus) 에 `/api/tripo/generate` 프록시 라우트만 추가하면 즉시 통합 가능. 클라이언트는 `useGLTF` 가 이미 구성되어 있어 결과 GLB URL 만 전달받으면 바로 렌더.

## 출처

- 공식: https://www.tripo3d.ai/ , https://platform.tripo3d.ai/
- 가격: https://www.tripo3d.ai/pricing
- API: https://www.tripo3d.ai/api , https://apidog.com/blog/how-to-use-tripo-3d-api/
- Auto Rigging: https://www.tripo3d.ai/features/ai-auto-rigging
- Mixamo 가이드: https://www.tripo3d.ai/blog/rig-ai-generated-character-for-mixamo
- 비교(2026): https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026
- 비교 (Medium): https://medium.com/data-science-in-your-pocket/ai-3d-model-generators-compared-tripo-ai-meshy-ai-rodin-ai-and-more-8d42cc841049
- 가이드 (lorphic): https://lorphic.com/tripo-ai-pricing-3d-models-full-guide-and-review/
- Tripo 자체 잼 (전례): https://itch.io/jam/tripo-3d-game-jam-for-gdc-2026-portal-pass
- @tripoai 잼 트윗: https://x.com/tripoai/status/2009466688371372442
- Vibe Jam 2026: https://vibej.am/2026/
- levelsio 발표: https://x.com/levelsio/status/2039777677435908421

## 미해결

1. Vibe Jam 2026 전용 Tripo 크레딧 코드 존재 여부 → @tripoai · Vibe Jam Discord 에서 직접 확인 필요
2. "Best use of Tripo3D" 같은 스폰서 카테고리 상금 → 페이지 미명시, 마감 직전 재확인
3. Tripo API CORS 정책 → 백엔드 프록시 가정으로 설계 안전
