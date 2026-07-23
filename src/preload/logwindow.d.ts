import type { LogWindowApi } from './logwindow';

declare global {
  interface Window {
    logApi: LogWindowApi;
  }
}
