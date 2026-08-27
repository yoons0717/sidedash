import type { ServerWindowApi } from './serverwindow';

declare global {
  interface Window {
    serverApi: ServerWindowApi;
  }
}
