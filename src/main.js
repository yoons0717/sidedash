import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { menubar } from 'menubar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.dock.hide();

const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  browserWindow: {
    width: 340,
    height: 400,
  },
});

mb.on('ready', () => {
  console.log('sidedash is ready');
});
