# CLAUDE.md

## 기획 문서

없음 — 기능 문서는 README에만 남긴다. `docs/`에 스펙/플랜 문서를 만들었으면 기능 완료 후 삭제하고 README로 옮긴다.

## 코드 컨벤션

**렌더러 모듈은 화면(뷰) 단위로 분리한다.** `src/renderer/src/`:
- `app.ts` — 엔트리포인트. `init()` + 팝업 최상위 뷰 전환(`showProjectView`)만. 얇게 유지.
- `cards.ts` / `project-view.ts` / `servers-view.ts` — 화면 하나(프로젝트 카드 목록, 프로젝트 상세 페이지, 서버 서브뷰)씩. 카드는 훑어보기용 정보만, 링크·상태 점검·액션 관리처럼 실제로 뭘 하는 UI는 전부 상세 페이지로 — 이 경계가 다시 애매해지면(카드에 버튼이 하나둘 늘면) 그때 또 정리한다. 새 팝업 서브뷰를 추가할 땐 새 파일로.
  - 두 뷰 모듈이 서로의 함수를 불러야 하면(`cards.ts`의 카드 클릭 → `project-view.ts`의 `showProjectDetail`, `project-view.ts`의 저장 후 → `cards.ts`의 `renderProjects`) 양방향 import 그 자체는 괜찮다 — 단, **이벤트 핸들러 안에서만** 참조해야 한다 (모듈 최상단 평가 시점에 서로를 읽으면 안 됨). 이 조건이 깨지면 3번째 모듈로 상태/로직을 뽑아낸다.
- 화면 파일 안에서도 성격이 다른 덩어리는 더 쪼갠다: 실행/버튼 상태 관리는 `action-runner.ts`, 펼치는 패널(대상 선택, 인자 입력 — 지금은 상세 페이지가 씀)은 `action-panels.ts`. 둘 다 특정 화면 전용이 아니라 여러 화면이 가져다 쓸 수 있는 일반 로직이라 `-view.ts` 접미사를 안 붙임 — 이름 자체는 "카드"가 아니라 "액션"에 붙인다, 실제로 다루는 게 카드가 아니라 액션 실행이라서. "지금 이 파일 하나만 쓴다"는 이유로 안 쪼개지 말 것 — 파일이 스캔하기 버거워지면 소비자가 하나든 여럿이든 쪼갠다. 화면이 옮겨가면(카드 → 상세 페이지처럼) 이 파일들 안의 타입/파일 이름도 옛 화면 이름에 묶여 있지 않은지 같이 확인한다.

**모듈 간 공유 상태는 값을 직접 노출하지 않는다.** 두 단계:
1. 기본은 완전히 숨기고 함수로만 조작 — `action-runner.ts`의 `runningPaths`(다른 파일은 아예 못 건드림, `clearRunning()` 하나로만 노출)가 원형.
2. 다른 모듈이 최신값을 실시간으로 *읽어야만* 할 때만 `state.ts`처럼 `let`으로 export해 라이브 바인딩을 주고(`currentProjects`), 쓰기는 여전히 전용 setter(`setCurrentProjects`)로만 막는다.

**CSS는 인라인 `<style>`이 아니라 별도 `.css` 파일 + `<link>`.** `index.html`은 마크업만, 스타일은 `src/app.css`. electron-vite/Vite가 `<link rel="stylesheet">`를 알아서 번들에 넣어주므로 빌드 설정 변경 불필요.

**메인 프로세스 순수 로직은 vitest로 테스트한다.** `main/lib/scanner.ts`, `main/lib/portscan.ts`, `main/actions/run.ts`, `main/actions/detect.ts`, `main/actions/history.ts` 패턴을 따른다 — 파일시스템/자식 프로세스를 감싸는 함수라도 입출력이 명확하면 테스트 대상. `main/lib/registry.ts`(레지스트리 read-modify-write)와 `main/index.ts`(IPC 배선)는 지금 테스트가 없다 — 새 함수를 추가할 때 그 파일 전체를 테스트 대상으로 끌어올리진 말고, 로직이 옮겨갈 수 있는 곳(예: `actions/run.ts`)이 있으면 거기로 옮겨서 테스트한다.

**렌더러 UI는 자동화 테스트 대상이 아니다.** 수동 검증(`npm run dev`)으로 확인한다.

**모듈을 옮기거나 쪼갠 뒤, 또는 `index.html`/electron.vite.config.ts처럼 빌드에 관여하는 파일을 고친 뒤엔 `npm run dev`뿐 아니라 `npm run build`도 한 번 돌린다.** dev 서버는 파일을 개별 서빙해서 순환 import나 애셋 경로 문제를 가려버릴 수 있고, 실제 문제는 Rollup이 모듈 그래프를 진짜로 묶는 프로덕션 빌드에서만 드러난다.

**기존 패턴을 찾아서 재사용한다, 새로 안 만든다.** 새 팝업 서브뷰가 필요하면 별도 창 대신 `body.classList`로 뷰 전환(서버 뷰가 원형). 펼치는 패널이 필요하면 `.target-select` 패턴(대상 선택 패널이 원형, `action-panels.ts`) 재사용.

**이 앱은 개인 도구다 — 신뢰 경계가 없는 곳(외부 서비스 응답, 여러 사용자가 쓰는 서버 등)과 같은 기준으로 입력을 방어하지 않는다.** 예: 커스텀 액션의 `{args}` 프롬프트 입력은 `shellQuote()`로 감싸지 않고 셸에 그대로 넘어간다(`run.ts`의 `applyArgs` 주석 참고) — 사용자가 자기 컴퓨터에서 자기 명령어를 확장하는 것으로 본다. 이 판단을 조용히 뒤집지 말고, 바꿀 이유가 생기면 트레이드오프를 먼저 얘기한다.
