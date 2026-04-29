# claudedocs/ — Research Reports

> AI가 생성한 리서치 보고서. 코드 변경 없는 정보 수집/분석 결과.

## 명명 규칙

`research_<topic>_<YYYYMMDD>.md`

- `topic`: snake_case 단어 1-3개 (메카닉, 시각, 임팩트 등)
- `YYYYMMDD`: 작성일

## 현재 보고서

| 파일 | 주제 | 활용 |
|---|---|---|
| `research_chambara_20260428.md` | Switch Sports Chambara 메카닉 분석 | 게임 룰의 진실 소스 — slice/thrust/guard 상호작용 |
| `research_chambara_visuals_20260429.md` | R3F 시각 처리 가이드 (Bloom, 트레일, 카툰 물) | **Day 1 시각 P0 작업 순서**의 근거 §7 |
| `research_impact_feedback_20260429.md` | 타격감 (시각·청각·햅틱·시간·공간 5축) | 임팩트 링/셰이크/SFX 구현 가이드, BLOCK/HIT/PIERCE/KO별 시퀀스 |
| `research_character_weapon_customization_20260429.md` | 캐릭터·라이트세이버 디자인 + 잼 커스터마이징 스코프 + Quaternius/Mixamo/Tripo3D 파이프라인 + IP-안전 네이밍 | 후드 몽크 권장 §2.4, 마젠타 사이드 ID §3.3, 잼 미니멈(이름+색) §4.3, Mixamo 검술 6종 §5.2, `BASIC_SWORD`→`PLASMA_BLADE` §7.3 |

## 보고서를 어떻게 다룰까

- **참고 문서**: 의사결정 시 권장사항을 인용하되, 모든 항목이 잼 일정에 들어가지는 않음. 우선순위(P0/P1/P2)에 따라 선별.
- **갱신**: 한 번 쓰면 보통 수정 안 함. 새 정보 → 새 보고서 (날짜 다름).
- **링크**: `docs/duel-implementation.md` §10 / `docs/game-design.md` §8 등에서 참조.

## 코드는 직접 import 하지 말 것

리서치 보고서에 포함된 코드 스니펫은 **설계 안내 예시**. 실제 구현은 `client/`/`shared/`에 사용자 결정 후 별도 단계로 작성.
