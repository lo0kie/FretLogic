import { z } from 'zod';

export const createZodSerializer = <T>(schema: z.ZodSchema<T>, defaultValue: T) => {
  return {
    read: (raw: string): T => {
      try {
        const parsed = JSON.parse(raw);
        const result = schema.safeParse(parsed);

        if (result.success) {
          return result.data;
        }

        console.warn(`[Storage Guard] 检测到本地缓存数据结构违规，已拦截并自动回滚默认值。`);
        return defaultValue;
      } catch {
        return defaultValue;
      }
    },
    write: (value: T): string => {
      return JSON.stringify(value);
    },
  };
};
