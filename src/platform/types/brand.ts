/** 品牌类型基础：运行时就是原始类型，编译期防止不同 id / 标量混用 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
