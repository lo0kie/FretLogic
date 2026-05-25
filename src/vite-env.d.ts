/**
 * @Author likan
 * @Date 2026-05-25 09:31:28
 * @Filepath guitar-chord-lab\src\vite-env.d.ts
 */

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
