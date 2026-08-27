import type { ServerInfo } from '../../shared/types';

function serverDisplayName(server: ServerInfo): string {
  if (server.projectName) return server.projectName;
  if (server.cwd) return server.cwd.split('/').pop() || '알 수 없음';
  return '알 수 없음';
}

function renderServers(servers: ServerInfo[]): void {
  const listEl = document.getElementById('server-list')!;
  listEl.innerHTML = '';

  if (servers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '실행 중인 개발 서버가 없어요.';
    listEl.appendChild(empty);
    return;
  }

  for (const server of servers) {
    const row = document.createElement('div');
    row.className = 'server-row';

    const name = document.createElement('span');
    name.className = 'server-row-name';
    name.textContent = `${serverDisplayName(server)} · ${server.techStack}`;
    row.appendChild(name);

    const port = document.createElement('span');
    port.className = 'server-row-meta';
    port.textContent = `:${server.port}`;
    row.appendChild(port);

    const killBtn = document.createElement('button');
    killBtn.className = 'server-row-kill';
    killBtn.textContent = '✕';
    killBtn.title = '서버 종료';
    killBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      killBtn.disabled = true;
      killBtn.textContent = '…';
      window.serverApi.killServer(server.pid).catch((err) => console.error('kill-server failed:', err));
    });
    row.appendChild(killBtn);

    row.addEventListener('click', () => {
      window.serverApi.openExternal(`http://localhost:${server.port}`).catch((err) =>
        console.error('open server failed:', err)
      );
    });

    listEl.appendChild(row);
  }
}

window.serverApi.onServersUpdated(renderServers);
