# sidedash 메뉴바 대시보드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** debrief/reentry-cli/resume-ym을 버튼 클릭으로 실행하는 macOS 메뉴바 상주 Electron 앱을 만든다.

**Architecture:** Electron + `menubar` 패키지로 트레이 팝업 구성. 프로젝트 레지스트리는 reentry-cli의 `~/.pj/registry.json`을 `registry.js`/`scanner.js` 모듈 재사용으로 공유. 액션 실행은 로그인 셸을 통한 `child_process.spawn` + 별도 로그 창.

**Tech Stack:** Electron, Node.js (ESM), `menubar` npm 패키지, reentry-cli의 `registry.js`/`scanner.js` (로컬 file: 의존성으로 재사용), vitest.

## Global Constraints (스펙 기준)

- 개인용 전용 — 코드사이닝/노터라이제이션/자동 업데이트/App Store 배포 없음
- reentry-cli의 `pj` CLI와 `pj dashboard`는 수정하지 않는다 — sidedash는 별도 저장소
- 데이터는 `~/.pj/registry.json` 하나만 사용 (새 저장소 포맷 만들지 않음)
- 액션 버튼 노출은 파일 존재 여부로 자동 감지 (`run.sh` → 파이프라인 실행, `package.json`
  scripts에 `pdf` → PDF 생성), 동작 자체는 debrief/resume-ym 두 케이스로 한정
- 명령어 실행은 반드시 로그인 셸(`/bin/zsh -lc`)을 통해 spawn — PATH 상속 문제 방지
- 실행 중인 프로젝트는 버튼 비활성화 + 스피너 (중복 실행 방지)
- 실패(0이 아닌 종료 코드) 시 로그 창은 자동으로 닫지 않는다

---

### Task 1: 프로젝트 스캐폴딩 + 빈 트레이 팝업

**Files:**
- Create: `sidedash/package.json`
- Create: `sidedash/src/main.js` (Electron 메인 프로세스, menubar 초기화)
- Create: `sidedash/src/index.html` (팝업 안에 뜨는 빈 화면)

**Interfaces:**
- Produces: `npm start`로 앱 실행 시 메뉴바에 아이콘이 뜨고, 클릭하면 빈 팝업 창이 뜬다.

- [ ] `npm init` 후 `electron`, `menubar` 설치, `"type": "module"` 설정
- [ ] `src/main.js`에서 `menubar({ index: ..., browserWindow: { width: 340, height: 400 } })` 로 트레이 앱 초기화, Dock 아이콘 숨김(`app.dock.hide()`). `"type": "module"`이라 `__dirname`을 바로 못 쓰므로 `index`는 `` `file://${path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html')}` `` 형태로 만든다
- [ ] 트레이 아이콘 이미지 파일 준비 필요 — `menubar`는 `icon` 옵션을 안 주면 `opts.dir` 안의 `IconTemplate.png`를 기본으로 찾으므로, `src/IconTemplate.png`(20x20, 레티나용 `src/IconTemplate@2x.png` 40x40도 함께)를 준비하거나 `icon` 옵션으로 직접 경로 지정
- [ ] `src/index.html`에 "내 프로젝트 (0)" 정도의 placeholder만 표시
- [ ] 수동 확인: `npm start` 실행 → 메뉴바에 아이콘 표시 → 클릭 시 팝업이 아이콘 아래에 뜨는지, 바깥 클릭 시 닫히는지 확인
- [ ] Commit: `git add -A && git commit -m "Scaffold electron menubar app shell"`

---

### Task 2: 레지스트리 재사용 + 프로젝트 카드 렌더링 (읽기 전용)

**Files:**
- Modify: `sidedash/package.json` (reentry-cli를 `"reentry-cli": "file:../reentry-cli"`로 의존성 추가)
- Create: `sidedash/src/ipc/projects.js` (registry.js/scanner.js를 조합해 렌더링용 데이터 만드는 함수)
- Modify: `sidedash/src/main.js` (IPC 핸들러 등록)
- Create: `sidedash/src/renderer/app.js` (팝업 안에서 카드 목록 그리는 스크립트)
- Modify: `sidedash/src/index.html`

**Interfaces:**
- Consumes: reentry-cli `registry.js`의 `getAll()` → `{ name, path, addedAt }[]`. `scanner.js`의 `getLastCommit(path)` → `{ message, date } | null`, `getGitStatus(path)` → `{ branch, hasUncommittedChanges, changedFileCount } | null` (브랜치와 미커밋 여부가 이 함수 하나에 같이 들어있음, 별도 `getBranch()`는 없음)
- Produces: `getProjectCards()` — `{ name, path, branch, lastCommit, hasUncommittedChanges, pathExists }[]`를 반환하는 함수. `branch`/`hasUncommittedChanges`는 `getGitStatus()` 결과에서, `lastCommit`은 `getLastCommit()`이 반환하는 `{ message, date }` 객체를 그대로 옮김 (문자열이 아님). Task 3~5에서 이 배열의 각 항목을 기준으로 카드를 그린다.

- [ ] `src/ipc/projects.js`에 `getProjectCards()` 작성 — `registry.getAll()`로 목록을 가져오고, 각 프로젝트마다 `fs.existsSync(path)` 확인 후 존재하면 `getGitStatus(path)`로 `branch`/`hasUncommittedChanges`를, `getLastCommit(path)`로 `lastCommit`을 채움, 경로가 없으면 `pathExists: false`만 채움
- [ ] `main.js`에 `ipcMain.handle('get-project-cards', () => getProjectCards())` 등록
- [ ] `renderer/app.js`에서 앱 로드 시 IPC로 카드 데이터 가져와 리스트 렌더링 (이름 / 브랜치+커밋 또는 "경로를 찾을 수 없음")
- [ ] 수동 확인: 터미널에서 `pj add`로 등록해둔 프로젝트가 있다면(또는 테스트용으로 하나 등록), 앱을 켰을 때 그 카드가 정확한 브랜치/커밋 정보와 함께 뜨는지 확인
- [ ] Commit: `git add -A && git commit -m "Render project cards from shared pj registry"`

---

### Task 3: 프로젝트 추가/삭제 UI

**Files:**
- Modify: `sidedash/src/main.js` (폴더 선택 다이얼로그 + add/remove IPC 핸들러)
- Modify: `sidedash/src/renderer/app.js` (＋ 버튼, ✕ 버튼 핸들러)
- Modify: `sidedash/src/index.html` (＋ 버튼 마크업)

**Interfaces:**
- Consumes: reentry-cli의 `add(name, path)`, `remove(name)` (registry.js)
- Produces: `ipcMain.handle('add-project')`, `ipcMain.handle('remove-project', (e, name) => ...)` — 둘 다 처리 후 최신 `getProjectCards()` 결과를 반환해 렌더러가 다시 그리게 함

- [ ] ＋ 버튼 클릭 시 `dialog.showOpenDialog({ properties: ['openDirectory'] })` 호출 → 선택한 폴더 이름을 `path.basename()`으로 뽑아 `registry.add(name, path)` 호출
- [ ] 각 카드의 ✕ 클릭 시 `registry.remove(name)` 호출
- [ ] 두 핸들러 모두 처리 후 카드 목록을 다시 렌더링
- [ ] 수동 확인: 앱에서 폴더 하나 추가 → 터미널에서 `pj list` 실행했을 때 방금 추가한 게 보이는지 (레지스트리 공유 확인). 앱에서 삭제 → `pj list`에서도 사라지는지 확인
- [ ] Commit: `git add -A && git commit -m "Add project add/remove via UI, shared with pj CLI"`

---

### Task 4: 액션 버튼 자동 감지 (유닛 테스트) + 카드 상세정보 펼치기

**Files:**
- Create: `sidedash/src/actions/detect.js`
- Test: `sidedash/src/actions/detect.test.js`
- Modify: `sidedash/src/renderer/app.js` (카드 클릭 시 상세정보 펼침, 액션 버튼 표시)

**Interfaces:**
- Produces: `detectAction(projectPath)` → `'pipeline' | 'pdf' | null`
  - `'pipeline'`: `<projectPath>/run.sh` 파일 존재
  - `'pdf'`: `<projectPath>/package.json`의 `scripts.pdf` 존재 (scanner.js의 `getPackageScripts()` 재사용)
  - 둘 다 없으면 `null`

- [ ] 실패하는 테스트 작성 (임시 디렉토리에 `run.sh` 만들어서 `'pipeline'` 반환 확인, `pdf` 스크립트 있는 `package.json`으로 `'pdf'` 반환 확인, 둘 다 없으면 `null` 확인)
- [ ] `vitest run src/actions/detect.test.js` 실행 → FAIL 확인
- [ ] `detect.js` 구현
- [ ] 다시 실행 → PASS 확인
- [ ] 카드 클릭 시 상세정보 펼침/접힘 토글 — `scanner.js`의 `findTodos(path)`(배열 길이로 TODO/FIXME 개수 표시)와 `getPackageScripts(path)`(scripts 목록) 재사용. `detectAction()` 결과에 따라 "파이프라인 실행" 또는 "PDF 생성" 버튼 표시
- [ ] 수동 확인: debrief 폴더 등록 시 "파이프라인 실행" 버튼, resume-ym 등록 시 "PDF 생성" 버튼, reentry-cli 등록 시 버튼 없음 확인
- [ ] Commit: `git add -A && git commit -m "Add action detection with tests and card expand UI"`

---

### Task 5: 액션 실행 + 실시간 로그 창 + 중복 실행 방지

**Files:**
- Create: `sidedash/src/actions/run.js` (spawn 래퍼 + 실행 상태 추적)
- Test: `sidedash/src/actions/run.test.js` (`shellQuote()`만 유닛 테스트, spawn/IPC는 수동 확인)
- Create: `sidedash/src/logwindow.js` (로그 창 BrowserWindow 생성 + IPC 스트리밍)
- Create: `sidedash/src/logwindow.html`
- Modify: `sidedash/src/main.js` (액션 버튼 클릭 IPC 핸들러 연결)
- Modify: `sidedash/src/renderer/app.js` (실행 중 버튼 비활성화 + 스피너)

**Interfaces:**
- Consumes: `getProjectCards()` (Task 2, debrief의 인자 조립에 필요 — "자신을 제외한 나머지 전체 경로")
- Produces:
  - `shellQuote(str)` — 셸 명령어 문자열에 안전하게 끼워넣기 위해 경로를 작은따옴표로 감싸는 헬퍼: `` `'${str.replace(/'/g, `'\\''`)}'` ``. 등록된 프로젝트 경로에 공백이나 특수문자가 있으면(예: iCloud 하위 폴더) 따옴표 없이 그냥 join할 경우 인자가 깨지거나 의도치 않은 명령이 실행될 수 있어서 반드시 각 경로를 이 함수로 감싼 뒤 join한다.
  - `runAction(project, allProjects, { onData, onExit })` — `project.actionType`이 `'pipeline'`이면 `otherPaths = allProjects.filter(p => p.path !== project.path).map(p => p.path)`를 `shellQuote()`로 감싸 join한 뒤 `spawn("/bin/zsh", ["-lc", "./run.sh " + quotedPaths.join(" ")], { cwd: project.path })`, `'pdf'`면 `spawn("/bin/zsh", ["-lc", "npm run pdf"], { cwd: project.path })` 실행. stdout/stderr 청크마다 `onData(chunk)`를 호출하고, 프로세스 종료 시 `onExit(code)`를 호출한다 (이 두 콜백이 Task 6의 로그 창/완료 처리가 훅을 거는 지점)
  - 실행 중인 프로젝트 경로를 담는 `runningProjects` Set — 이미 실행 중이면 `runAction`을 다시 호출하지 않고 즉시 반환

- [ ] `run.js`에 `shellQuote(str)` 헬퍼와 `runAction(project, allProjects, { onData, onExit })` 작성 — actionType에 따라 명령어 문자열 조립 (debrief는 `allProjects`에서 자기 자신 제외한 경로들을 `shellQuote()`로 감싼 뒤 인자로), `child_process.spawn`으로 실행, stdout/stderr 청크를 `onData`로 전달, 종료 시 `onExit(code)` 호출
- [ ] `runningProjects` Set으로 이미 실행 중인 project.path는 재실행 막기
- [ ] `shellQuote()` 유닛 테스트 작성 (공백 포함 경로 `/Users/x/My Project`, 작은따옴표 포함 경로 `/Users/x/it's-mine` 두 케이스로 감싼 결과가 셸에서 하나의 인자로 안전하게 파싱되는지) → `vitest run src/actions/run.test.js`로 FAIL 확인 → 구현 → PASS 확인
- [ ] `logwindow.js`: 새 `BrowserWindow` 열고 `onData`로 받은 청크를 그 창의 `<pre>` 영역에 append하는 IPC 연결
- [ ] `renderer/app.js`: 액션 버튼 클릭 → 메인 프로세스에 실행 요청 → 실행 중인 카드는 버튼을 스피너로 교체, 실행 끝나면 원래 버튼으로 복귀
- [ ] 수동 확인: debrief 등록된 상태에서 "파이프라인 실행" 클릭 → 로그 창이 뜨고 `collect_commits.py` 등의 출력이 실시간으로 쌓이는지, 실행 중 같은 버튼을 다시 눌러도 중복 실행 안 되는지, 등록된 프로젝트 중 하나를 일부러 공백 있는 경로에 두고도 정상적으로 인자가 전달되는지 확인
- [ ] Commit: `git add -A && git commit -m "Run actions via login shell with streaming log window"`

---

### Task 6: 완료 후 결과 열기 + 실패 처리

**Files:**
- Modify: `sidedash/src/logwindow.js` (종료 코드에 따라 성공/실패 UI + 결과 열기 버튼)
- Modify: `sidedash/src/logwindow.html`

**Interfaces:**
- Consumes: `runAction`의 `onExit(code)` 콜백 (Task 5)
- Produces: 로그 창 하단에 성공/실패 상태 + (성공 시) "노트 열기"(debrief, `project.path/notes`를 `shell.openPath()`) 또는 "PDF 폴더 열기"(resume-ym, `project.path/pdf-output`) 버튼

- [ ] `onExit(code)`가 0이면 로그 창 하단에 "완료" 표시 + actionType에 맞는 "결과 열기" 버튼 추가, 클릭 시 `shell.openPath()`로 해당 폴더를 Finder로 연다
- [ ] `onExit(code)`가 0이 아니면 "실패 (종료 코드 N)" 표시만 하고 로그 창은 그대로 유지 (자동으로 닫지 않음)
- [ ] 수동 확인: debrief 파이프라인 정상 완료 후 "노트 열기" 클릭 시 Finder로 notes 폴더가 열리는지. 일부러 실패하는 명령(예: 존재하지 않는 스크립트)으로 테스트해서 실패 표시와 로그 창 유지 확인
- [ ] Commit: `git add -A && git commit -m "Add success/failure handling and result folder shortcuts"`

---

## Self-Review

- **스펙 커버리지:** 트레이 팝업(T1), 레지스트리 공유(T2,T3), 자동 감지(T4), 실행+로그 스트리밍+중복방지(T5), 완료 후 결과 열기+실패 처리(T6) — 스펙의 아키텍처/컴포넌트/에러처리 섹션 전부 대응됨. "카드 클릭 시 상세정보 펼치기"는 T4에 포함. PATH 상속 대응(로그인 셸)은 Global Constraints와 T5에 반영.
- **스코프 밖 항목**(정렬 토글, 로그 히스토리 저장, 제3 도구 자동 감지)은 의도적으로 계획에서 제외 — 스펙과 일치.
- **타입/시그니처 일관성:** `getProjectCards()`가 반환하는 필드명(`name/path/branch/lastCommit/hasUncommittedChanges/pathExists`)을 이후 태스크에서 동일하게 참조하도록 통일함. `detectAction()`의 반환값(`'pipeline'|'pdf'|null`)을 T5/T6에서 `project.actionType`으로 일관되게 사용.
- **재검토(2차) 수정 사항:**
  - Task 2가 실제로 존재하지 않는 `getBranch()`를 참조하고 있었음 — `reentry-cli/src/scanner.js`를 다시 확인해 실제 함수(`getLastCommit`, `getGitStatus`)와 정확한 반환 타입으로 교체.
  - Task 4의 "TODO 개수"가 어떤 함수를 쓰는지 명시가 안 돼 있었음 — `findTodos()`로 명시.
  - Task 5에서 debrief 실행 인자(다른 등록 프로젝트 경로들)를 따옴표 없이 그냥 join하고 있었음 — 경로에 공백이나 특수문자가 있으면 셸 인자가 깨지는 실제 버그라서 `shellQuote()` 헬퍼와 유닛 테스트를 추가.
  - Task 1이 `menubar`의 `index`/`icon` 옵션을 placeholder처럼 뭉뚱그려 썼음 — ESM에서 `__dirname` 대체 방법과, 트레이 아이콘 파일이 기본적으로 필요하다는 점(`IconTemplate.png` 관례)을 구체화.
