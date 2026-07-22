# sidedash

개인 사이드 프로젝트용 CLI 도구들을 매번 터미널에서 명령어를 기억해 실행하는 대신,
macOS 메뉴바에서 버튼 클릭으로 실행할 수 있게 해주는 개인용 Electron 대시보드입니다.

배포를 목표로 하지 않는 개인 전용 도구로, 코드사이닝/노터라이제이션/자동 업데이트/App Store
배포는 스코프에서 제외되어 있습니다.

## 주요 기능

- Dock 아이콘 없이 메뉴바 트레이 아이콘으로만 상주 (`menubar` 패키지 사용)
- 트레이 클릭 시 등록된 프로젝트 카드 목록을 팝업으로 표시
  - 카드에는 브랜치, 마지막 커밋, 미커밋 변경 여부가 표시됩니다
  - 카드를 클릭하면 TODO/FIXME 개수, `package.json` scripts 등 상세 정보가 펼쳐집니다
- ＋ 버튼으로 새 프로젝트 폴더를 등록, ✕ 버튼으로 제거
- 프로젝트 루트 파일 존재 여부에 따라 액션 버튼을 자동 감지
  - `run.sh`가 있으면 "파이프라인 실행" 버튼 (예: debrief)
  - `package.json`의 `scripts.pdf`가 있으면 "PDF 생성" 버튼 (예: resume-ym)
- 액션 실행 시 별도 로그 창을 열어 stdout/stderr를 실시간 스트리밍
- 실행 중인 프로젝트는 버튼이 비활성화되어 중복 실행 방지

## 데이터 레이어

프로젝트 레지스트리는 별도로 만들지 않고 [reentry-cli](../reentry-cli)의
`registry.js`(등록/조회/삭제)와 `scanner.js`(git 상태, scripts, TODO 스캔)를 그대로
import해서 재사용합니다. 터미널에서 `pj add`로 등록하든 sidedash 앱에서 등록하든
`~/.pj/registry.json`을 공유합니다.

## 요구 사항

- macOS
- Node.js
- 로컬 경로의 [`reentry-cli`](../reentry-cli) 저장소 (형제 디렉토리로 존재해야 함,
  `package.json`에서 `file:../reentry-cli`로 참조)

## 시작하기

```bash
npm install
npm start
```

## 테스트

```bash
npm test
```

순수 로직(액션 감지, 실행 커맨드 조립 등)은 vitest 유닛 테스트로 커버되어 있습니다.
Electron UI(트레이 팝업, 로그 창)는 자동화 테스트 없이 직접 실행해 수동으로 확인합니다.

## 프로젝트 구조

```
src/
├── main.js              # Electron 메인 프로세스, 메뉴바/IPC 설정
├── preload.cjs          # 렌더러 프리로드 스크립트
├── index.html           # 트레이 팝업 UI
├── logwindow.html/.js   # 액션 실행 로그 창
├── renderer/app.js      # 팝업 렌더러 로직
├── actions/
│   ├── detect.js        # run.sh / pdf 스크립트 존재 여부로 액션 타입 감지
│   └── run.js           # child_process.spawn으로 액션 실행, 실시간 로그 스트리밍
└── ipc/
    └── projects.js      # 프로젝트 카드/상세 정보 조회, 중복 등록 방지
```

## 스코프 밖

- 코드사이닝/노터라이제이션/자동 업데이트/App Store 배포
- 정렬 토글(최근순/이름순)
- 로그 히스토리 저장
- `run.sh`, `pdf` 스크립트 외 다른 자동 액션 감지 규칙

더 자세한 설계 배경은 [`docs/superpowers/specs/2026-07-22-menubar-dashboard-design.md`](docs/superpowers/specs/2026-07-22-menubar-dashboard-design.md)를 참고하세요.
