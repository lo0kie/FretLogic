// src/env.d.ts

// 处理 .vue 文件
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// 处理 .less 文件，消除导入报错
declare module '*.less' {
  const content: any;
  export default content;
}

// 如果你还用到了 css 或 scss，也可以一并加上
declare module '*.css' {
  const content: any;
  export default content;
}
