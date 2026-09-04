import { formatExitReason } from '../../shared/format';

const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;

function appendText(text: string): void {
  logEl.appendChild(document.createTextNode(text));
  window.scrollTo(0, document.body.scrollHeight);
}

window.logApi.onLogData((chunk) => {
  appendText(chunk);
});

window.logApi.onLogExit(({ code, path, actionType, resultDir }) => {
  if (code === 0) {
    statusEl.className = 'success';
    statusEl.textContent = '완료';

    // pipeline (notes/) and pdf (pdf-output/) always write to a known
    // folder; a custom action only has one if the user set 결과 폴더.
    // Analysis output is the log body itself — never a folder.
    let folder: string | null = null;
    let label = '결과 폴더 열기';
    if (actionType === 'pipeline') {
      folder = `${path}/notes`;
      label = '노트 열기';
    } else if (actionType === 'pdf') {
      folder = `${path}/pdf-output`;
      label = 'PDF 폴더 열기';
    } else if (actionType === 'custom' && resultDir) {
      folder = resultDir.startsWith('/') ? resultDir : `${path}/${resultDir}`;
    }

    if (folder) {
      const target = folder;
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => {
        window.logApi.openPath(target).then((errorMessage) => {
          if (errorMessage) {
            appendText(`\n폴더를 열 수 없습니다: ${errorMessage}\n`);
          }
        });
      };
      statusEl.appendChild(button);
    }
  } else {
    statusEl.className = 'failure';
    statusEl.textContent = `실패 (${formatExitReason(code)})`;
  }
});
