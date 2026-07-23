import type { SidedashApi } from './index';

declare global {
  interface Window {
    api: SidedashApi;
  }
}
