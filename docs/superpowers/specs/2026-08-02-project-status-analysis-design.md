# sidedash — 프로젝트 상태 분석 기능 설계

## 배경 및 목적

여러 사이드 프로젝트를 만들었다 방치하는 일이 반복되면서, 어떤 프로젝트를 계속하고 어떤 걸
정리할지 결정하는 데 드는 "선택 피로"가 커졌다. 문제는 판단 근거가 없다는 것 — 오랜만에 열어보면
그 프로젝트가 뭘 하려던 건지, 어디까지 됐는지부터 파악하는 데 시간이 든다.

이 기능은 AI가 대신 결정(계속/보류/삭제)을 내려주는 게 아니라, **판단에 필요한 재료(상태 요약)를
제공**하는 데 그친다. 최종 판단은 사용자가 한다.

sidedash는 이미 "여러 프로젝트를 한눈에 보고, 기존 스크립트를 버튼 하나로 실행"하는 가벼운
런처다. 이 기능은 새 화면이나 백그라운드 자동화가 아니라, 기존 "액션 실행" 개념(파이프라인
실행, PDF 생성과 동일한 패턴)의 확장으로 붙인다 — 그래야 "가벼운 메뉴바 런처"라는 정체성이
깨지지 않는다.

## 아키텍처

- **트리거는 항상 노출된 별도 액션이다.** 기존 `pipeline`/`pdf`는 `run.sh`/`package.json`
  존재 여부로 감지되는, 프로젝트당 하나뿐인 액션이다. "상태 분석"은 감지 대상이 아니라 모든
  프로젝트 카드에 항상 뜨는 독립된 버튼이며, 기존 액션 버튼과 나란히 표시된다.
- **분석은 Claude Code CLI를 헤드리스로 실행해서 수행한다.** 별도 LLM API 키/과금 없이
  이미 쓰고 있는 Claude Code 구독을 그대로 쓴다. `claude -p "<프롬프트>"`를 대상 프로젝트
  폴더를 cwd로 자식 프로세스로 실행하고, 표준출력을 요약으로 받는다.
  - 프롬프트는 README, git log, 소스 구조를 읽고 "어디까지 됐는지, 어디서 멈췄는지"를
    사실 기반으로 **2~3문장, 포맷 없는 평문**으로 요약하도록 명시적으로 지시한다. 계속/보류/
    삭제 추천은 요청하지 않는다 (판단은 사용자 몫). **완성도를 숫자(%)로 내지 않는다** —
    그럴듯해 보이지만 근거가 불확실한 수치는 오히려 판단에 과도한 영향을 주므로, "파서는
    완성, UI는 스켈레톤만" 같은 정성적 서술만 받는다.
- **실행 파이프는 기존 액션 실행 메커니즘을 재사용한다.** `src/main/actions/run.ts`의
  스폰/스트리밍/프로세스 그룹 종료 로직을 그대로 쓰고, `actionType`에 `'analyze'` 분기를
  추가하는 방식으로 확장한다. 새 프로세스 관리 계층을 만들지 않는다.
- **결과 표시는 기존 로그 창을 재사용한다.** 파이프라인/PDF 실행과 동일한 로그 창
  (`src/main/logwindow.ts`)에 스트리밍되며, 완료 시 기존 알림(Notification) 패턴을 그대로
  쓴다.
- **결과는 프로젝트 카드에 저장되어 다음에 팝업을 열어도 남아있는다.** `registry.json`은
  reentry-cli와 공유하는 포맷이므로 여기에 얹지 않는다. `lastRun`이 `registry.json`이 아닌
  별도 `last-run.json`(userData 폴더)에 저장되는 기존 선례를 그대로 따라, 새 `analysis.json`
  (userData 폴더)에 프로젝트 경로를 키로 `{ summary, analyzedAt }`를 저장한다.
- **동시성 제약은 기존 `runningProjects` Map을 그대로 쓴다.** 같은 프로젝트에서 다른 액션이
  실행 중이면 분석 버튼도, 분석 중이면 다른 액션 버튼도 비활성화된다. 새 동시성 모델을 만들지
  않는다.

## 컴포넌트 (파일별 변경 사항)

`ActionType`(`'pipeline' | 'pdf'`)은 "카드의 감지된 기본 액션"이라는 기존 의미를 그대로
유지하고 건드리지 않는다. 대신 "지금 로그 창에 스트리밍 중인 게 무엇인지"를 나타내는 새 타입
`RunKind = ActionType | 'analyze'`를 추가해, 실행/로그 창 관련 파일에서만 좁게 쓴다. 이렇게
분리하는 이유는 `ACTION_LABELS`/`ACTION_ICONS` 같은 `Record<ActionType, ...>`가 카드의 기본
액션 버튼 표시에만 쓰이는데, 여기에 `analyze`를 섞으면 "카드 기본 액션으로는 절대 나오지 않는
케이스"를 억지로 채워 넣어야 하기 때문이다.

- **`src/shared/types.ts`**
  - `RunKind = ActionType | 'analyze'` 추가 (신규 타입, `ActionType` 자체는 변경 없음).
  - `ProjectCard`에 `lastAnalysis: { summary: string; analyzedAt: string } | null` 추가.
  - `LogExitPayload.actionType`의 타입을 `ActionType` → `RunKind`로 변경.
- **`src/main/actions/analysis.ts` (신규)**
  - `history.ts`와 동일한 패턴(JSON 읽기/쓰기, 프로젝트 경로 키)으로 `analysis.json` 읽기/쓰기
    함수 제공 (`getLastAnalysis`, `recordAnalysis`).
- **`src/main/actions/run.ts`**
  - `RunnableProject.actionType`의 타입을 `ActionType` → `RunKind`로 변경.
  - `runAction()`의 커맨드 분기에 `analyze` 케이스 추가: `claude -p '<프롬프트>'` 조합
    (기존 `shellQuote` 재사용).
- **`src/main/logwindow.ts`**
  - `LogWindowProject.actionType`의 타입을 `ActionType` → `RunKind`로 변경 (그 외 로직 변경
    없음 — `finish()`가 그대로 `actionType`을 payload에 실어 보냄).
- **`src/renderer/src/logwindow.ts`**
  - `onLogExit` 완료 분기에 `analyze` 케이스 추가: 폴더 열기 버튼 없이 "완료" 상태만 표시
    (분석 결과는 로그 본문 자체가 요약이라 별도로 열 폴더가 없음). 기존 `pipeline`/`pdf`
    2지선다 삼항 연산자를 3-way 분기로 바꾼다.
- **`src/main/ipc/projects.ts`**
  - `getProjectCards()`가 `analysis.ts`의 `getLastAnalysis()`를 조회해 `lastAnalysis` 채움.
    `history.ts`처럼 파일 경로를 인자로 받는 패턴이라 `getProjectCards()` 시그니처에
    `analysisFilePath` 파라미터가 추가되고, `index.ts`의 호출부(4곳: `get-project-cards`,
    `add-project`, `remove-project`, `run-action`)가 모두 새 `ANALYSIS_FILE` 상수를 같이
    넘기도록 바뀐다.
- **`src/main/index.ts`**
  - 새 IPC 핸들러 `run-analysis` 추가 (기존 `run-action` 핸들러와 유사하되, `project.action`
    존재 여부를 게이트로 쓰지 않음 — 분석은 감지된 액션이 없어도 항상 가능해야 함). 기존
    `run-action`과 달리 `onData` 콜백에서 로그 창으로 보내는 것과 별개로 청크를 로컬 문자열에
    누적해서, 종료 시 그 누적 텍스트를 `recordAnalysis()`의 `summary`로 저장한다. 완료 알림
    라벨("상태 분석 완료"/"실패")은 `ACTION_LABELS`에 넣지 않고 핸들러 안에 직접 고정 문자열로
    둔다 (그 Record는 기존 감지 액션 전용으로 유지).
  - 분석 프로세스 종료 시 `recordAnalysis()` 호출 후 기존 `action-exited` 이벤트를 그대로
    재사용해 렌더러에 알림 (렌더러는 이미 이 이벤트에서 무조건 `refreshProjects()`로 전체
    재조회하므로 새 이벤트 채널이 필요 없다).
- **`src/preload/index.ts`**
  - `runAnalysis(path)` API 노출.
- **`src/renderer/index.html`**
  - "미분석"/"N일 전 분석" 태그 스타일, 분석 요약 박스 스타일 추가.
- **`src/renderer/src/app.ts`**
  - `renderCard()`에서 분석 버튼을 조건 없이(경로가 존재하는 프로젝트라면) 렌더링.
  - 제목 옆 태그: `lastAnalysis`가 없으면 무채색 "미분석", 있으면 강조색으로 상대 시각
    ("N일 전 분석") 표시.
  - `lastAnalysis`가 있을 때만 상세 줄 아래 요약 박스 렌더링.
  - 버튼 텍스트: 미분석 "🔍 상태 분석" / 분석 후 "🔍 다시 분석".

## 데이터 흐름

1. 사용자가 카드의 "🔍 상태 분석" 버튼 클릭.
2. 렌더러가 `window.api.runAnalysis(path)` 호출 → 메인 프로세스 `run-analysis` 핸들러.
3. 이미 실행 중이면 `already-running` 반환 (기존 `run-action`과 동일 패턴).
4. 로그 창 오픈 → `runAction()`에 `actionType: 'analyze'`로 위임 → `claude -p` 프로세스 스폰.
5. stdout/stderr가 로그 창으로 스트리밍.
6. 프로세스 종료(exit code 0) 시: 누적된 stdout을 요약으로 `recordAnalysis()`에 저장 →
   기존 `action-exited` 이벤트로 렌더러에 알림 → 렌더러가 프로젝트 목록 재조회
   (`refreshProjects`)해 카드 갱신.
7. 실패(0이 아닌 코드/에러)면 요약을 저장하지 않고 실패 알림만 표시 (기존 실패 알림 패턴
   재사용).

## 에러 처리

새 에러 케이스를 만들지 않는다. `claude` CLI가 설치되어 있지 않거나 실행에 실패하는 경우는
기존 `run.ts`의 `child.on('error')` / 비정상 종료 코드 처리 로직을 그대로 따른다 (로그 창에
에러 메시지 출력, 실패 알림 표시).

## 테스트

- `analysis.ts`의 읽기/쓰기 순수 로직은 `history.test.ts`와 동일한 패턴으로 Vitest 단위
  테스트를 작성한다 (기록 후 조회, 존재하지 않는 경로 조회 시 `null` 등).
- `run.ts`의 `analyze` 명령 조합 로직은 `run.test.ts` 패턴을 따라 커맨드 문자열 생성만
  단위 테스트한다 (실제 `claude` CLI 실행 자체는 통합 테스트 대상이 아님 — 기존 pipeline/pdf
  실행도 마찬가지로 수동 검증).
- Electron UI는 기존 방침대로 자동화 테스트 대신 수동 검증.

## 스코프 밖

- 여러 프로젝트를 한 번에 분석하는 일괄 실행 (지금은 프로젝트 하나씩 수동 트리거).
- AI가 계속/보류/삭제를 직접 추천하는 기능 (판단 재료 제공까지만).
- 별도 LLM API 키를 통한 분석 (Claude Code CLI 재사용으로 대체).
- 분석 결과 이력 관리 (`analysis.json`은 프로젝트당 최신 분석 하나만 덮어쓰기로 저장 —
  과거 분석과 비교하거나 진행률을 추적하는 기능은 만들지 않는다).
