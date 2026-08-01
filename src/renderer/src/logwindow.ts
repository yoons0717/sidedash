const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;

function appendText(text: string): void {
  logEl.appendChild(document.createTextNode(text));
  window.scrollTo(0, document.body.scrollHeight);
}

window.logApi.onLogData((chunk) => {
  appendText(chunk);
});

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
