# sidedash

macOS 메뉴바에서 여러 사이드 프로젝트의 상태를 확인하고 기존 실행 스크립트를 그대로 실행할 수 있는 개인용 Electron 대시보드입니다.

<p align="center">
  <img src="docs/screenshots/popup.png" alt="프로젝트 목록 팝업" width="260" />
</p>

## Tech Stack

| Category | Tech |
|----------|------|
| Framework | Electron |
| Language | TypeScript |
| Build | electron-vite |
| Test | Vitest |

## 왜 만들었나

여러 사이드 프로젝트를 동시에 진행하다 보니, 매번 터미널을 열어 프로젝트를 찾고 실행 명령어를 입력하거나 브랜치 상태를 확인하는 재진입 비용이 코드 작성 자체보다 커졌습니다.

이 재진입 비용을 줄이기 위해 메뉴바에서 프로젝트 상태를 한눈에 확인하고, 기존 스크립트를 그대로 실행할 수 있는 가벼운 런처를 만들었습니다.

## 주요 기능

**프로젝트 관리**
- 아이콘 클릭 시 프로젝트 목록 표시, 열 때마다 Git 상태 새로고침
- 카드에는 훑어보기 정보만: GitHub / VS Code / Finder / cmux 바로 열기, 브랜치·마지막 커밋 시각, 미커밋 변경 파일 수, 최근 커밋순 정렬
- ＋ / ✕ 버튼으로 등록 및 제거
- 카드 클릭 시 프로젝트 상세 페이지로 이동 — 상태 점검, 액션 실행/관리는 전부 여기서

<p align="center">
  <img src="docs/screenshots/popup.png" alt="프로젝트 목록 팝업" width="260" />
  <img src="docs/screenshots/detail.png" alt="프로젝트 상세 페이지" width="260" />
</p>

**실행 중인 개발 서버**
- 🖥 버튼으로 서버 목록 뷰 전환, 열 때마다 새로고침
- `lsof`로 리스닝 포트를 스캔해 node · python · ruby · php · java · deno · bun 프로세스만 표시
- 프로젝트명 · 스택 · 포트 표시, 행 클릭 시 브라우저로 열기, ✕ 버튼으로 종료

<p align="center">
  <img src="docs/screenshots/servers.png" alt="실행 중인 개발 서버 목록" width="260" />
</p>

**액션 실행**
- 프로젝트 상세 페이지의 액션 목록에서 ▶ 버튼으로 실행 — `run.sh` → "파이프라인 실행" (대상 프로젝트 선택 → 인자 전달 → 실행 명령 미리보기), `package.json`의 `scripts.pdf` → "PDF 생성"
- 로그 창에서 stdout / stderr 실시간 스트리밍
- 완료 시 성공/실패 표시, 성공 시 결과 폴더 여는 버튼 + macOS 알림
- 실행 중인 프로젝트는 버튼 비활성화로 중복 실행 방지, 종료 시도 시 확인 다이얼로그 후 정리

<p align="center">
  <img src="docs/screenshots/log-window.png" alt="액션 실행 로그 창" width="420" />
</p>

**커스텀 액션**
- 프로젝트 상세 페이지의 "＋ 새 액션"으로 프로젝트별 액션(라벨 + 셸 명령어)을 등록/수정/삭제 — 자동 감지된 파이프라인/PDF 액션과 별개로 원하는 만큼 추가
- 명령어 입력 시 `package.json` 스크립트를 클릭 한 번으로 채울 수 있는 추천 칩 표시
- "실행 시 인자 입력받기"를 켜면 실행 전 입력값이 명령어의 `{args}` 자리에 삽입 (토큰이 없으면 뒤에 붙음)
- "결과 폴더" 지정 시 완료 후 로그 창에 여는 버튼 표시

<p align="center">
  <img src="docs/screenshots/action-form.png" alt="새 액션 등록 폼" width="260" />
</p>

**상태 점검**
- 프로젝트 상세 페이지의 "🔍 상태 점검" 버튼 → Claude Code CLI(`claude -p`)가 최근 git 커밋과 소스 구조를 읽고 완성도 점수(0~100)와 다음 할 일 한 줄을 판단
- 평가 기준(점수 구간별 설명)과 결과를 로그 창에 스트리밍 — 어떤 프로젝트부터 손대야 할지 판단할 재료만 보여주고, 계속할지 말지는 추천하지 않음
- 결과는 저장하지 않고 로그 창에서만 확인 — 어디에도 흔적이 남지 않으며, 다시 보려면 버튼을 다시 눌러야 함

## 데이터 레이어

프로젝트 레지스트리는 `src/main/lib/registry.ts`에서 관리하며 `~/.pj/registry.json`에 저장됩니다.

Git 정보(브랜치, 마지막 커밋, GitHub URL)는 `src/main/lib/scanner.ts`에서 수집합니다.

레지스트리 포맷은 reentry-cli와 동일하며, 필요한 로직만 가져와 `pj` 명령어와 프로젝트 목록을 공유합니다.

## 요구 사항

- macOS
- Node.js
- Claude Code CLI (`claude`) — "상태 점검" 기능에 사용, 로그인되어 있어야 합니다.

## 시작하기

```bash
npm install
npm start
```

`electron-vite dev`를 실행합니다.

렌더러는 Hot Reload를 지원하며, main / preload 프로세스는 변경 시 자동으로 재시작됩니다.

## 앱으로 패키징

```bash
npm run package
```

`dist/sidedash-darwin-arm64/sidedash.app`이 생성됩니다.

Applications 폴더로 이동하거나 Dock에 고정해 사용할 수 있습니다.

서명 없이 배포되는 개인용 도구이므로 처음 실행할 때 macOS의 **"확인되지 않은 개발자"** 경고가 나타납니다. Finder에서 우클릭 → **열기**를 선택하면 실행할 수 있습니다.

### 로그인 시 자동 실행

패키징된 앱은 실행 시 로그인 항목에 자동 등록됩니다.

`시스템 설정 → 일반 → 로그인 항목`에서 확인하거나 해제할 수 있으며, 앱을 다른 위치로 옮기면 새 위치로 다시 등록됩니다.

## 테스트

```bash
npm test           # Vitest
npm run typecheck  # tsc -b --noEmit
```

순수 로직은 Vitest로 테스트합니다.

Electron UI는 자동화 테스트 대신 수동으로 검증합니다.

## 프로젝트 구조

```text
src/
├── main/
│   ├── index.ts          # Electron 메인 프로세스, 메뉴바/IPC 설정
│   ├── logwindow.ts      # 로그 창 BrowserWindow 생성/관리
│   ├── actions/
│   │   ├── detect.ts     # run.sh / pdf 스크립트 감지
│   │   ├── run.ts        # 액션 실행, 로그 스트리밍, 프로세스 트리 정리
│   │   └── history.ts    # 마지막 실행 시각 관리
│   ├── ipc/
│   │   └── projects.ts   # 프로젝트 조회, 등록, 삭제 IPC
│   └── lib/
│       ├── registry.ts   # 프로젝트 등록/조회/삭제, 커스텀 액션 CRUD
│       ├── scanner.ts    # Git 상태(status --porcelain) 및 package.json 스캔
│       ├── portscan.ts   # lsof 기반 개발 서버 감지 / 종료
│       └── jsonStore.ts  # JSON 저장소 read / write 헬퍼
├── preload/
│   ├── index.ts
│   └── logwindow.ts
├── renderer/
│   ├── index.html            # 마크업만 (스타일은 src/app.css)
│   ├── src/app.ts             # 엔트리포인트 — init() + 뷰 전환
│   ├── src/app.css            # 팝업 스타일
│   ├── src/state.ts           # 뷰 간 공유 상태
│   ├── src/cards.ts           # 프로젝트 카드(훑어보기용) 렌더 + 목록 관리
│   ├── src/action-runner.ts   # 액션 실행 orchestration, 버튼 상태
│   ├── src/action-panels.ts   # 펼치는 패널 (대상 선택, 인자 입력)
│   ├── src/project-view.ts    # 프로젝트 상세 페이지 — 링크·상태점검·액션 관리
│   ├── src/servers-view.ts    # 실행 중인 서버 서브뷰
│   └── logwindow.html / src/logwindow.ts
└── shared/
    ├── types.ts
    └── format.ts          # 액션 결과 메시지 포맷

resources/                 # 메뉴바 아이콘 등 런타임 리소스
electron.vite.config.ts    # main / preload / renderer 빌드 설정
```

