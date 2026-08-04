# 완성도 루브릭으로 단순화 Implementation Plan

**Goal:** 기존 "상태 분석" 기능(자유서술 요약을 카드에 저장·표시)을 완성도 점수 + 다음 액션을
로그 창에서만 보여주는 1회성 액션으로 축소한다. 상세 내용은 스펙 문서
(`docs/superpowers/specs/2026-08-04-completeness-rubric-design.md`) 참고.

## 작업 단위

- [ ] **Task 1 — 프롬프트 교체**: `src/main/actions/run.ts`의 `ANALYSIS_PROMPT`를 스펙에
  확정된 밴드 앵커 프롬프트로 바꾼다.
- [ ] **Task 2 — 카드 UI 정리**: `src/renderer/src/app.ts`, `src/renderer/index.html`에서
  분석 요약 박스·태그와 관련 CSS를 없애고 버튼만 남긴다.
- [ ] **Task 3 — 저장 계층 제거**: `src/main/actions/analysis.ts`를 삭제하고,
  `src/shared/types.ts` / `src/main/ipc/projects.ts` / `src/main/index.ts`에서 분석 결과
  저장·조회 관련 코드를 걷어낸다.

각 Task 후 `npm run typecheck` (Task 3은 `npm test`도) 통과 확인, 앱 실행해서 수동 확인,
커밋 순으로 진행한다.
