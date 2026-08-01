# Project Status Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "🔍 상태 분석" action to every project card that runs Claude Code CLI headlessly to produce a short, factual completion-state summary, so the user has judgment material (not a recommendation) when deciding what to do with a dormant side project.

**Architecture:** Reuse sidedash's existing action-running machinery end to end — the same spawn/stream/log-window/notification pipeline that already powers "파이프라인 실행" and "PDF 생성" — by adding a third, always-available `analyze` run kind that shells out to `claude -p "<prompt>"` instead of `run.sh`/`npm run pdf`. Results persist to a new `analysis.json` (mirroring the existing `last-run.json` precedent) so `registry.json`'s shared format with reentry-cli stays untouched.

**Tech Stack:** Electron, strict-mode TypeScript, electron-vite, Vitest.

## Global Constraints

- Analysis prompt output must be 2–3 plain sentences, no markdown/bullets, no numeric completion percentage, no continue/archive recommendation (spec: `docs/superpowers/specs/2026-08-02-project-status-analysis-design.md`).
- `registry.json` is not modified — it is shared with reentry-cli. Analysis results live in a separate `analysis.json` in Electron's userData dir.
- No new concurrency model — reuse `run.ts`'s existing `runningProjects` Map so analysis and any other action on the same project path mutually exclude each other.
- `ActionType` (`'pipeline' | 'pdf'`) keeps its existing meaning ("card's detected primary action") and is not widened. A new `RunKind = ActionType | 'analyze'` type is used only where "what's currently streaming to the log window" matters.
- Zero `any` / `@ts-ignore` anywhere in `src/` (existing project-wide standard) — every new file must satisfy `tsc -b --noEmit` in strict mode.
- Electron UI code (renderer, main window wiring) has no automated tests in this codebase — verify those tasks by running `npm run dev` and exercising the UI manually, matching the existing convention (see `README.md`'s "테스트" section).

---

## File Structure

- `src/main/actions/analysis.ts` (new) — `analysis.json` read/write, mirrors `history.ts`.
- `src/main/actions/analysis.test.ts` (new) — unit tests for the above.
- `src/main/actions/run.ts` (modify) — add `analyze` command branch + `buildAnalyzeCommand()`.
- `src/main/actions/run.test.ts` (modify) — add `buildAnalyzeCommand()` test.
- `src/main/logwindow.ts` (modify) — widen `LogWindowProject.actionType` to `RunKind`.
- `src/renderer/src/logwindow.ts` (modify) — add `analyze` branch to the completion UI (no folder-open button).
- `src/main/ipc/projects.ts` (modify) — `getProjectCards()` gains an `analysisFilePath` param and fills `lastAnalysis`.
- `src/main/index.ts` (modify) — `ANALYSIS_FILE` constant, update all `getProjectCards()` call sites, add `run-analysis` IPC handler.
- `src/preload/index.ts` (modify) — expose `runAnalysis(path)`.
- `src/renderer/index.html` (modify) — CSS for the analysis tag and summary box.
- `src/renderer/src/app.ts` (modify) — render the analyze button/tag/summary box, wire click handling, keep sibling buttons in sync.
- `src/shared/types.ts` (modify across tasks 1, 2, 4) — `AnalysisResult`, `RunKind`, `ProjectCard.lastAnalysis`, `LogExitPayload.actionType`.

---

### Task 1: `analysis.ts` result storage

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/actions/analysis.ts`
- Test: `src/main/actions/analysis.test.ts`

**Interfaces:**
- Produces: `export interface AnalysisResult { summary: string; analyzedAt: string }` (in `src/shared/types.ts`)
- Produces: `recordAnalysis(analysisFilePath: string, projectPath: string, summary: string, analyzedAt?: string): void`
- Produces: `getLastAnalysis(analysisFilePath: string, projectPath: string): AnalysisResult | null`

- [ ] **Step 1: Add `AnalysisResult` to shared types**

In `src/shared/types.ts`, add near `LastCommit`:

```ts
export interface AnalysisResult {
  summary: string;
  analyzedAt: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/main/actions/analysis.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getLastAnalysis, recordAnalysis } from './analysis';

describe('analysis', () => {
  let dir: string | undefined;
  let analysisFile: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  function setup(): void {
    dir = mkdtempSync(path.join(tmpdir(), 'sidedash-analysis-'));
    analysisFile = path.join(dir, 'analysis.json');
  }

  it('returns null for a project that has never been analyzed', () => {
    setup();
    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toBeNull();
  });

  it('records and retrieves a summary for a project', () => {
    setup();
    recordAnalysis(analysisFile, '/Users/x/debrief', '파서는 완성, UI는 스켈레톤만 있음.', '2026-07-30T10:00:00.000Z');

    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toEqual({
      summary: '파서는 완성, UI는 스켈레톤만 있음.',
      analyzedAt: '2026-07-30T10:00:00.000Z',
    });
  });

  it('overwrites the previous analysis on a second recording, without disturbing other projects', () => {
    setup();
    recordAnalysis(analysisFile, '/Users/x/debrief', '1차 요약', '2026-07-30T10:00:00.000Z');
    recordAnalysis(analysisFile, '/Users/x/resume-ym', '다른 프로젝트 요약', '2026-07-31T09:00:00.000Z');
    recordAnalysis(analysisFile, '/Users/x/debrief', '2차 요약', '2026-08-01T11:00:00.000Z');

    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toEqual({
      summary: '2차 요약',
      analyzedAt: '2026-08-01T11:00:00.000Z',
    });
    expect(getLastAnalysis(analysisFile, '/Users/x/resume-ym')).toEqual({
      summary: '다른 프로젝트 요약',
      analyzedAt: '2026-07-31T09:00:00.000Z',
    });
  });

  it('defaults analyzedAt to now when not given explicitly', () => {
    setup();
    const before = Date.now();
    recordAnalysis(analysisFile, '/Users/x/debrief', '요약');
    const after = Date.now();

    const recorded = new Date(getLastAnalysis(analysisFile, '/Users/x/debrief')!.analyzedAt).getTime();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npm test -- analysis.test.ts`
Expected: FAIL — `./analysis` module not found.

- [ ] **Step 3: Implement `analysis.ts`**

Create `src/main/actions/analysis.ts`:

```ts
import fs from 'node:fs';
import type { AnalysisResult } from '../../shared/types';

type AnalysisStore = Record<string, AnalysisResult>;

function readAnalysisStore(analysisFilePath: string): AnalysisStore {
  if (!fs.existsSync(analysisFilePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(analysisFilePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function recordAnalysis(
  analysisFilePath: string,
  projectPath: string,
  summary: string,
  analyzedAt: string = new Date().toISOString()
): void {
  const store = readAnalysisStore(analysisFilePath);
  store[projectPath] = { summary, analyzedAt };
  fs.writeFileSync(analysisFilePath, JSON.stringify(store, null, 2));
}

export function getLastAnalysis(analysisFilePath: string, projectPath: string): AnalysisResult | null {
  return readAnalysisStore(analysisFilePath)[projectPath] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- analysis.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/actions/analysis.ts src/main/actions/analysis.test.ts
git commit -m "Add analysis.json storage for project status summaries"
```

---

### Task 2: `run.ts` analyze command + `RunKind` type

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/actions/run.ts`
- Test: `src/main/actions/run.test.ts`

**Interfaces:**
- Consumes: `shellQuote(str: string): string` (already in `run.ts`)
- Produces: `export type RunKind = ActionType | 'analyze'` (in `src/shared/types.ts`)
- Produces: `export const ANALYSIS_PROMPT: string` (in `run.ts`)
- Produces: `export function buildAnalyzeCommand(): string` (in `run.ts`)
- Modifies existing: `RunnableProject.actionType` from `ActionType` to `RunKind`; `LogExitPayload.actionType` from `ActionType` to `RunKind`

- [ ] **Step 1: Widen `RunKind` and `LogExitPayload` in shared types**

In `src/shared/types.ts`, add after `ActionType`:

```ts
export type RunKind = ActionType | 'analyze';
```

Change:

```ts
export interface LogExitPayload {
  code: number | null;
  path: string;
  actionType: ActionType;
}
```

to:

```ts
export interface LogExitPayload {
  code: number | null;
  path: string;
  actionType: RunKind;
}
```

- [ ] **Step 2: Write the failing test**

In `src/main/actions/run.test.ts`, add a new `describe` block (keep existing imports, add `ANALYSIS_PROMPT` and `buildAnalyzeCommand` to the import from `./run`):

```ts
import {
  ANALYSIS_PROMPT,
  buildAnalyzeCommand,
  createUtf8Decoder,
  hasRunningActions,
  isRunning,
  killAllRunning,
  runAction,
  runningProjects,
  shellQuote,
} from './run';
```

Add this `describe` block anywhere at the top level of the file (e.g. right after the `shellQuote` block):

```ts
describe('buildAnalyzeCommand', () => {
  it('wraps the analysis prompt as a single quoted argument to claude -p', () => {
    expect(buildAnalyzeCommand()).toBe(`claude -p ${shellQuote(ANALYSIS_PROMPT)}`);
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npm test -- run.test.ts`
Expected: FAIL — `ANALYSIS_PROMPT`/`buildAnalyzeCommand` not exported from `./run`.

- [ ] **Step 3: Implement the analyze command branch**

In `src/main/actions/run.ts`, change the import:

```ts
import type { RunKind } from '../../shared/types';
```

(replacing `import type { ActionType } from '../../shared/types';`)

Change the `RunnableProject` interface:

```ts
export interface RunnableProject {
  path: string;
  actionType: RunKind;
}
```

Add near the top-level exports (after `shellQuote`):

```ts
export const ANALYSIS_PROMPT =
  '이 프로젝트의 README, 최근 git 커밋 로그, 소스 파일 구조를 읽고, 지금 이 프로젝트가 어디까지 완성됐고 어디서 작업이 멈췄는지를 2~3문장의 평문으로 요약해줘. 마크다운 형식이나 글머리 기호는 쓰지 말고, 완성도를 숫자나 퍼센트로 매기지 말고, 이 프로젝트를 계속하는 게 좋을지 말지는 추천하지 마.';

export function buildAnalyzeCommand(): string {
  return `claude -p ${shellQuote(ANALYSIS_PROMPT)}`;
}
```

In `runAction()`, change the command branch:

```ts
  let command: string;
  if (project.actionType === 'pipeline') {
    const quotedPaths = targetPaths.map(shellQuote);
    command = './run.sh ' + quotedPaths.join(' ');
  } else if (project.actionType === 'pdf') {
    command = 'npm run pdf';
  } else if (project.actionType === 'analyze') {
    command = buildAnalyzeCommand();
  } else {
    return;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- run.test.ts`
Expected: PASS (all existing `run.test.ts` tests plus the new one).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/actions/run.ts src/main/actions/run.test.ts
git commit -m "Add analyze command branch to run.ts and RunKind type"
```

---

### Task 3: Log window `RunKind` propagation + analyze completion UI

**Files:**
- Modify: `src/main/logwindow.ts`
- Modify: `src/renderer/src/logwindow.ts`

**Interfaces:**
- Consumes: `RunKind` (from Task 2), `LogExitPayload` (already widened in Task 2)
- No new exports — this task only widens an existing internal type and adds a UI branch.

**Note:** Nothing triggers an `analyze` run end-to-end yet (that lands in Task 5), so this task is verified by typecheck only. It gets exercised live in Task 6's manual test.

- [ ] **Step 1: Widen `LogWindowProject.actionType`**

In `src/main/logwindow.ts`, change the import and interface:

```ts
import type { RunKind } from '../shared/types';

interface LogWindowProject {
  path: string;
  actionType: RunKind;
}
```

(No other change needed in this file — `finish()` already just forwards `project.actionType` into the payload.)

- [ ] **Step 2: Add the `analyze` branch to the completion UI**

In `src/renderer/src/logwindow.ts`, replace:

```ts
window.logApi.onLogExit(({ code, path, actionType }) => {
  if (code === 0) {
    statusEl.className = 'success';
    statusEl.textContent = '완료';

    const folder = actionType === 'pipeline' ? `${path}/notes` : `${path}/pdf-output`;
    const label = actionType === 'pipeline' ? '노트 열기' : 'PDF 폴더 열기';

    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => {
      window.logApi.openPath(folder).then((errorMessage) => {
        if (errorMessage) {
          appendText(`\n폴더를 열 수 없습니다: ${errorMessage}\n`);
        }
      });
    };
    statusEl.appendChild(button);
  } else {
    statusEl.className = 'failure';
    statusEl.textContent = code === null ? '실패 (프로세스를 시작하지 못함)' : `실패 (종료 코드 ${code})`;
  }
});
```

with:

```ts
window.logApi.onLogExit(({ code, path, actionType }) => {
  if (code === 0) {
    statusEl.className = 'success';
    statusEl.textContent = '완료';

    // Analysis output is already the full log body — there's no separate
    // output folder to open, unlike pipeline (notes/) or pdf (pdf-output/).
    if (actionType !== 'analyze') {
      const folder = actionType === 'pipeline' ? `${path}/notes` : `${path}/pdf-output`;
      const label = actionType === 'pipeline' ? '노트 열기' : 'PDF 폴더 열기';

      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => {
        window.logApi.openPath(folder).then((errorMessage) => {
          if (errorMessage) {
            appendText(`\n폴더를 열 수 없습니다: ${errorMessage}\n`);
          }
        });
      };
      statusEl.appendChild(button);
    }
  } else {
    statusEl.className = 'failure';
    statusEl.textContent = code === null ? '실패 (프로세스를 시작하지 못함)' : `실패 (종료 코드 ${code})`;
  }
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/logwindow.ts src/renderer/src/logwindow.ts
git commit -m "Propagate RunKind through the log window and handle analyze completion"
```

---

### Task 4: `ProjectCard.lastAnalysis` + `getProjectCards()` wiring

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc/projects.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `getLastAnalysis(analysisFilePath: string, projectPath: string): AnalysisResult | null` (Task 1)
- Produces: `ProjectCard.lastAnalysis: AnalysisResult | null`
- Modifies existing: `getProjectCards(historyFilePath: string, analysisFilePath: string): ProjectCard[]` (adds a required second parameter)

- [ ] **Step 1: Add `lastAnalysis` to `ProjectCard`**

In `src/shared/types.ts`, change:

```ts
export interface ProjectCard {
  name: string;
  path: string;
  pathExists: boolean;
  branch: string | null;
  lastCommit: LastCommit | null;
  hasUncommittedChanges: boolean;
  changedFileCount: number;
  action: ActionType | null;
  lastRun: string | null;
  githubUrl: string | null;
}
```

to:

```ts
export interface ProjectCard {
  name: string;
  path: string;
  pathExists: boolean;
  branch: string | null;
  lastCommit: LastCommit | null;
  hasUncommittedChanges: boolean;
  changedFileCount: number;
  action: ActionType | null;
  lastRun: string | null;
  githubUrl: string | null;
  lastAnalysis: AnalysisResult | null;
}
```

- [ ] **Step 2: Wire `getLastAnalysis()` into `getProjectCards()`**

In `src/main/ipc/projects.ts`, add the import:

```ts
import { getLastAnalysis } from '../actions/analysis';
```

Change the function signature and body:

```ts
export function getProjectCards(historyFilePath: string, analysisFilePath: string): ProjectCard[] {
  return registry.getAll().map(({ name, path: projectPath }) => {
    const lastRun = historyFilePath ? getLastRun(historyFilePath, projectPath) : null;
    const lastAnalysis = analysisFilePath ? getLastAnalysis(analysisFilePath, projectPath) : null;
    const pathExists = fs.existsSync(projectPath);
    if (!pathExists) {
      return {
        name,
        path: projectPath,
        branch: null,
        lastCommit: null,
        hasUncommittedChanges: false,
        changedFileCount: 0,
        pathExists,
        action: null,
        lastRun,
        githubUrl: null,
        lastAnalysis,
      };
    }

    const gitStatus = getGitStatus(projectPath);
    const lastCommit = getLastCommit(projectPath);

    return {
      name,
      path: projectPath,
      branch: gitStatus?.branch ?? null,
      lastCommit,
      hasUncommittedChanges: gitStatus?.hasUncommittedChanges ?? false,
      changedFileCount: gitStatus?.changedFileCount ?? 0,
      pathExists,
      action: detectAction(projectPath),
      lastRun,
      githubUrl: getGitHubUrl(projectPath),
      lastAnalysis,
    };
  });
}
```

- [ ] **Step 3: Add `ANALYSIS_FILE` and update every `getProjectCards()` call site**

In `src/main/index.ts`, change:

```ts
const HISTORY_FILE = path.join(app.getPath('userData'), 'last-run.json');
```

to:

```ts
const HISTORY_FILE = path.join(app.getPath('userData'), 'last-run.json');
const ANALYSIS_FILE = path.join(app.getPath('userData'), 'analysis.json');
```

Then replace every occurrence of `getProjectCards(HISTORY_FILE)` with `getProjectCards(HISTORY_FILE, ANALYSIS_FILE)`. There are 5 occurrences: the `get-project-cards` handler, both `return` statements inside the `add-project` handler, the `remove-project` handler, and the `cards` lookup inside the `run-action` handler.

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: PASS (existing `projects.test.ts` only covers `canAddProject`, unaffected by this change).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc/projects.ts src/main/index.ts
git commit -m "Wire lastAnalysis into ProjectCard and getProjectCards()"
```

---

### Task 5: `run-analysis` IPC handler + preload API

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `recordAnalysis` (Task 1), `buildAnalyzeCommand`/`analyze` run branch (Task 2), `RunKind`-aware log window (Task 3), `getProjectCards(HISTORY_FILE, ANALYSIS_FILE)` (Task 4)
- Produces: IPC channel `run-analysis` — `(projectPath: string) => RunActionResult`
- Produces: `window.api.runAnalysis(path: string): Promise<RunActionResult>`

- [ ] **Step 1: Import `recordAnalysis` in `index.ts`**

In `src/main/index.ts`, add to the existing action imports:

```ts
import { recordAnalysis } from './actions/analysis';
```

- [ ] **Step 2: Add the `run-analysis` handler**

In `src/main/index.ts`, add after the existing `run-action` handler:

```ts
const ANALYSIS_LABEL = '상태 분석';

ipcMain.handle('run-analysis', (_event, projectPath: string): RunActionResult => {
  const cards = getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
  const project = cards.find((p) => p.path === projectPath);
  if (!project) {
    return { ok: false, reason: 'invalid' };
  }

  if (isRunning(project.path)) {
    return { ok: false, reason: 'already-running' };
  }

  const projectWithType = { ...project, actionType: 'analyze' as const };
  const logWindow = openLogWindow(project.name, projectWithType);

  let summary = '';

  runAction(
    projectWithType,
    [],
    {
      onData: (chunk) => {
        summary += chunk;
        logWindow.appendData(chunk);
      },
      onExit: (code) => {
        mb.window?.webContents.send('action-exited', { path: project.path, code });
        logWindow.finish(code);

        if (code === 0) {
          recordAnalysis(ANALYSIS_FILE, project.path, summary.trim());
        }

        const body =
          code === 0 ? `${ANALYSIS_LABEL} 완료`
          : code === null ? `${ANALYSIS_LABEL} 실패 (프로세스를 시작하지 못함)`
          : `${ANALYSIS_LABEL} 실패 (종료 코드 ${code})`;
        const notification = new Notification({ title: project.name, body });
        notification.on('click', () => logWindow.focus());
        notification.show();
      },
    }
  );

  return { ok: true };
});
```

- [ ] **Step 3: Expose `runAnalysis` in the preload API**

In `src/preload/index.ts`, add to the `api` object (after `runAction`):

```ts
  runAnalysis: (path: string): Promise<RunActionResult> => ipcRenderer.invoke('run-analysis', path),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "Add run-analysis IPC handler and preload API"
```

---

### Task 6: Card UI — analyze button, tag, summary box

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/app.ts`

**Interfaces:**
- Consumes: `window.api.runAnalysis(path)` (Task 5), `ProjectCard.lastAnalysis` (Task 4), `formatRelativeTime` (already in `app.ts`)

- [ ] **Step 1: Add CSS**

In `src/renderer/index.html`, add inside the existing `<style>` block (after `.card-remove:hover`):

```css
      .card-analysis-tag {
        font-size: 9px;
        color: #6a6a85;
        background: #2c2c46;
        padding: 2px 6px;
        border-radius: 5px;
        flex-shrink: 0;
      }
      .card-analysis-tag.done {
        color: #8b8bd8;
      }
      .card-analysis {
        margin-top: 8px;
        padding: 8px 10px;
        background: #191928;
        border-radius: 8px;
        font-size: 11px;
        color: #b5b5d0;
        line-height: 1.55;
        border-left: 2px solid #4a4a6a;
      }
      .card-analyze-row {
        margin-top: 8px;
      }
      .card-action.card-action-secondary {
        background: #2c2c46;
        color: #b5b5d0;
      }
      .card-action.card-action-secondary:hover:not(.card-action-running) {
        filter: brightness(1.2);
      }
```

- [ ] **Step 2: Add the analysis tag next to the title**

In `src/renderer/src/app.ts`, inside `renderCard()`, find where `removeBtn` is created and appended (right after the existing `if (project.action) { ... header.appendChild(actionBtn); }` block). Insert before the `removeBtn` creation:

```ts
  if (project.pathExists) {
    const analysisTag = document.createElement('span');
    analysisTag.className = 'card-analysis-tag' + (project.lastAnalysis ? ' done' : '');
    analysisTag.textContent = project.lastAnalysis
      ? `${formatRelativeTime(project.lastAnalysis.analyzedAt)} 분석`
      : '미분석';
    header.appendChild(analysisTag);
  }
```

- [ ] **Step 3: Declare `analyzeBtn` and thread it through the existing action handlers**

Still in `renderCard()`, change the declaration line:

```ts
  let targetSelectPanel: HTMLDivElement | null = null;
  let actionBtn: HTMLButtonElement | null = null;
```

to:

```ts
  let targetSelectPanel: HTMLDivElement | null = null;
  let actionBtn: HTMLButtonElement | null = null;
  let analyzeBtn: HTMLButtonElement | null = null;
```

Update `setActionButtonState` to also be callable for the sibling, and update `handleRunAction`'s signature to accept and sync the sibling `analyzeBtn`. Replace:

```ts
async function handleRunAction(project: ProjectCard, actionBtn: HTMLButtonElement, targetPaths: string[]): Promise<void> {
  if (runningPaths.has(project.path)) {
    return;
  }
  runningPaths.add(project.path);
  setActionButtonState(actionBtn, project);
  try {
    const result = await window.api.runAction(project.path, targetPaths);
    if (result.ok === false && result.reason !== 'already-running') {
      runningPaths.delete(project.path);
      setActionButtonState(actionBtn, project);
    }
  } catch (err) {
    console.error('run-action failed:', err);
    runningPaths.delete(project.path);
    setActionButtonState(actionBtn, project);
  }
}
```

with:

```ts
function setAnalyzeButtonState(analyzeBtn: HTMLButtonElement, project: ProjectCard): void {
  const running = runningPaths.has(project.path);
  analyzeBtn.disabled = running;
  analyzeBtn.classList.toggle('card-action-running', running);
  analyzeBtn.textContent = running
    ? '실행 중…'
    : project.lastAnalysis
      ? '🔍 다시 분석'
      : '🔍 상태 분석';
}

// Both buttons on a card share the same backend busy guard (runningProjects
// is keyed by path only, not by action), so starting either one must also
// visually disable the other immediately — otherwise the sibling button
// stays clickable until the next full refreshProjects() re-render.
async function handleRunAction(
  project: ProjectCard,
  actionBtn: HTMLButtonElement,
  analyzeBtn: HTMLButtonElement | null,
  targetPaths: string[]
): Promise<void> {
  if (runningPaths.has(project.path)) {
    return;
  }
  runningPaths.add(project.path);
  setActionButtonState(actionBtn, project);
  if (analyzeBtn) setAnalyzeButtonState(analyzeBtn, project);
  try {
    const result = await window.api.runAction(project.path, targetPaths);
    if (result.ok === false && result.reason !== 'already-running') {
      runningPaths.delete(project.path);
      setActionButtonState(actionBtn, project);
      if (analyzeBtn) setAnalyzeButtonState(analyzeBtn, project);
    }
  } catch (err) {
    console.error('run-action failed:', err);
    runningPaths.delete(project.path);
    setActionButtonState(actionBtn, project);
    if (analyzeBtn) setAnalyzeButtonState(analyzeBtn, project);
  }
}

async function handleRunAnalysis(
  project: ProjectCard,
  analyzeBtn: HTMLButtonElement,
  actionBtn: HTMLButtonElement | null
): Promise<void> {
  if (runningPaths.has(project.path)) {
    return;
  }
  runningPaths.add(project.path);
  setAnalyzeButtonState(analyzeBtn, project);
  if (actionBtn) setActionButtonState(actionBtn, project);
  try {
    const result = await window.api.runAnalysis(project.path);
    if (result.ok === false && result.reason !== 'already-running') {
      runningPaths.delete(project.path);
      setAnalyzeButtonState(analyzeBtn, project);
      if (actionBtn) setActionButtonState(actionBtn, project);
    }
  } catch (err) {
    console.error('run-analysis failed:', err);
    runningPaths.delete(project.path);
    setAnalyzeButtonState(analyzeBtn, project);
    if (actionBtn) setActionButtonState(actionBtn, project);
  }
}
```

- [ ] **Step 4: Update the two existing `handleRunAction()` call sites**

In `renderCard()`'s `actionBtn` click listener, change:

```ts
      } else {
        handleRunAction(project, actionBtn!, []);
      }
```

to:

```ts
      } else {
        handleRunAction(project, actionBtn!, analyzeBtn, []);
      }
```

In `buildTargetSelectPanel()`, change the function signature:

```ts
function buildTargetSelectPanel(project: ProjectCard, card: HTMLElement, actionBtn: HTMLButtonElement | null): HTMLDivElement {
```

to:

```ts
function buildTargetSelectPanel(
  project: ProjectCard,
  card: HTMLElement,
  actionBtn: HTMLButtonElement | null,
  analyzeBtn: HTMLButtonElement | null
): HTMLDivElement {
```

and inside it, change:

```ts
      handleRunAction(project, actionBtn!, targetPaths);
```

to:

```ts
      handleRunAction(project, actionBtn!, analyzeBtn, targetPaths);
```

And update its call site at the bottom of `renderCard()`:

```ts
  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, actionBtn);
    body.appendChild(targetSelectPanel);
  }
```

to:

```ts
  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, actionBtn, analyzeBtn);
    body.appendChild(targetSelectPanel);
  }
```

- [ ] **Step 5: Render the analysis summary box and button**

Still in `renderCard()`, right after `body.appendChild(detail);` (before the `if (project.hasUncommittedChanges)` block), add:

```ts
  if (project.pathExists) {
    if (project.lastAnalysis) {
      const analysisBox = document.createElement('div');
      analysisBox.className = 'card-analysis';
      analysisBox.textContent = project.lastAnalysis.summary;
      body.appendChild(analysisBox);
    }

    analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'card-action card-action-secondary';
    analyzeBtn.dataset.path = project.path;
    setAnalyzeButtonState(analyzeBtn, project);
    analyzeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleRunAnalysis(project, analyzeBtn!, actionBtn);
    });

    const analyzeRow = document.createElement('div');
    analyzeRow.className = 'card-analyze-row';
    analyzeRow.appendChild(analyzeBtn);
    body.appendChild(analyzeRow);
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Manual end-to-end verification**

This is the first point the whole feature is wired together, so verify it live:

1. Run `npm start`.
2. Confirm `claude` is on PATH: run `which claude` in a terminal — if missing, the analyze button will show the existing "명령을 실행할 수 없습니다" error path instead of a real summary (still correct behavior, just not what you want to eyeball for this check).
3. Open the sidedash popup. Every card — including ones with no "파이프라인 실행"/"PDF 생성" button — should show a "미분석" tag and a "🔍 상태 분석" button.
4. Click "🔍 상태 분석" on one project. Confirm: the button on that card immediately shows "실행 중…" and disables; a log window opens and streams Claude's output; a macOS notification appears on completion; clicking the notification focuses the log window; the log window's completion state shows "완료" with **no** folder-open button.
5. Reopen the popup (or click elsewhere and back). Confirm the card now shows a "N분 전 분석" tag (accent color) and a summary box with the 2–3 sentence result, and the button now reads "🔍 다시 분석".
6. On a project that also has a "파이프라인 실행"/"PDF 생성" button, click "🔍 상태 분석" and confirm the *other* button also disables immediately (not just after a refresh).
7. Run `npm test` and `npm run typecheck` one more time to confirm the full suite is still green.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/index.html src/renderer/src/app.ts
git commit -m "Add project status analysis UI to project cards"
```
