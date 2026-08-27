import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          logwindow: resolve(__dirname, 'src/preload/logwindow.ts'),
          serverwindow: resolve(__dirname, 'src/preload/serverwindow.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          logwindow: resolve(__dirname, 'src/renderer/logwindow.html'),
          serverwindow: resolve(__dirname, 'src/renderer/serverwindow.html'),
        },
      },
    },
  },
});
