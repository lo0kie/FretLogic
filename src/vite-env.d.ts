/// <reference types="vite/client" />

import type { TooltipBinding } from './directives/vTooltip';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;

  export default component;
}

declare module 'vue' {
  interface GlobalDirectives {
    vTooltip: Directive<HTMLElement, TooltipBinding>;
  }
}
