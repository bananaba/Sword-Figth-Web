# docs/ — Documentation Index

> 사람이 읽는 디자인/기획/구현 레퍼런스. 변경 자체로 코드 동작에 영향 없음.

## 어떤 문서를 언제 읽나

| 상황 | 문서 |
|---|---|
| **현재 빌드의 시스템 구조 이해** | `duel-implementation.md` (단일 진실 소스) |
| 컨셉 / 메카닉 / 입력 모델 디자인 의도 | `game-design.md` |
| 잼 일정 / Day 1 / Day 2 / P2 폴리시 우선순위 | `game-design.md` §6.1 |
| 데모 라우트(`?demo=arena` 등) 동작 | `prototypes.md` |
| 빌드/배포/dev 환경 | `setup.md`, `architecture.md` |
| 기술 스택 결정 근거 | `tech-stack.md` |
| 잼 규칙 / 컴플라이언스 체크리스트 | `vibe-jam.md` §8 |
| 출품작 시장 분석 / 화이트스페이스 | `submitted-games.md` |
| 캐릭터 에셋 (Tripo3D 활용) | `tripo3d.md` |
| fly.pieter 레퍼런스 (잼 시발점) | `fly-pieter-research.md` |

## 시각 레퍼런스

- `references/chambara-ref-1.webp` — 캐릭터 정중앙 뒤 카메라, 라이트세이버 풍 검 글로우
- `references/chambara-ref-2.jpg` — 머리 위 노란 별 2개 (스턴 인디케이터)
- `references/chambara-ref-3.jpg` — 동일 스턴 인디케이터 (다른 각도)

## 변경 시 규칙

- **`duel-implementation.md`은 빌드 상태 변경 시 반드시 갱신** — §3 피드백 표 + §9 작업 히스토리 + 영향받는 §4/§7 항목.
- **`game-design.md`는 미결정 항목 결정 시 갱신** — §6 미결정 표의 [ ] → [x] 와 결정 사유.
- 새 데모 라우트 추가 시 → `prototypes.md`에 추가.
- 새 외부 의존성 추가 시 → `tech-stack.md` "추가될 가능성" 표에서 → 본문으로 이동.

## 파일 명명

- 영문 ASCII만 사용 (한글 파일명은 git 인코딩 깨짐). 이미지: `<topic>-<n>.<ext>` 형식.
