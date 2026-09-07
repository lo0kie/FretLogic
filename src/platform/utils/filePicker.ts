/**
 * 纯函数式文件选择 API：业务层无需再在模版挂隐藏 <input type="file"> 节点。
 *
 * 优先级：
 * 1. 现代 Chromium 系浏览器的 File System Access API（showOpenFilePicker）——返回文件句柄，
 *    无需任何 DOM 节点，也只能在用户手势（点击）中调用，与导入按钮天然契合；
 * 2. 其它环境降级为动态创建 <input type="file"> 触发原生选择框，change 后经微任务把该节点
 *    从 DOM 移除并做空引用回收（避免隐藏节点长期驻留 / 同一文件二次选择失效）。
 *
 * 统一返回 Promise<File | null>：用户取消或选择失败返回 null，业务层 handle 后直接判空即走。
 */

export interface PickFileOptions {
  /** 接受的 MIME 类型 / 扩展名列表（传给 <input accept>），如 '.json'、'application/json' */
  accept?: string;
  /** 是否允许多选（默认 false，返回单个 File） */
  multiple?: boolean;
}

/** 判定浏览器是否具备 File System Access API（隐式 Feature Detection，避免直接引用未定义全局） */
const supportsShowOpenFilePicker = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';

/** 常见扩展名 → MIME 映射：showOpenFilePicker 的 types 需要显式 MIME，不能直接给扩展名 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * 由 accept 推导 showOpenFilePicker 的 types 配置：
 * - MIME 式 accept（含 '/'）直接作为键；
 * - 扩展名式 accept 查映射表得到 MIME；未知扩展名返回 null（省略 types，退化为不过滤，由业务层校验）。
 */
const derivePickerTypes = (accept: string): { description?: string; accept: Record<string, string[]> }[] | null => {
  const acceptMap: Record<string, string[]> = {};
  for (const token of accept
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)) {
    if (token.includes('/')) {
      (acceptMap[token] ??= []).push(token);
      continue;
    }
    const ext = token.startsWith('.') ? token.toLowerCase() : `.${token.toLowerCase()}`;
    const mime = EXTENSION_MIME_MAP[ext];
    // 未知扩展名不做猜测：返回 null 表示无法可靠构造 types，省略过滤
    if (!mime) return null;
    (acceptMap[mime] ??= []).push(ext);
  }
  if (Object.keys(acceptMap).length === 0) return null;
  return [{ accept: acceptMap }];
};

/** 动态创建并触发隐藏文件输入，change 后移除节点并清空 value，供同一文件重复选择 */
const pickViaInput = (options: PickFileOptions): Promise<File | null> =>
  new Promise(resolve => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    input.multiple = options.multiple ?? false;
    // 必须先用 CSS 隐藏再 append 到文档，点击前不可见、点击后不可残留
    input.className = 'hidden absolute';
    input.style.display = 'none';
    document.body.appendChild(input);

    // 结果只落定一次：change / cancel / 旧环境 focus 兜底三方竞争，先到先得
    let settled = false;
    const cleanup = () => {
      // 微任务回收：先清空 value（允许同一文件重复选择），再从 DOM 移除并释放引用
      queueMicrotask(() => {
        input.value = '';
        input.remove();
      });
    };
    const settle = (value: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
      cleanup();
    };

    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      settle(files[0] ?? null);
    });
    // 现代浏览器在选择框被取消（按 Esc / 关闭）时派发 cancel
    input.addEventListener('cancel', () => settle(null));

    // 旧环境兜底：取消选择框不派发 cancel 也不派发 change，Promise 会永久挂起。
    // 选择框关闭必然伴随窗口重新聚焦，聚焦后延时仍无结果则视为取消（给 change 留出竞速窗口）。
    const onWindowFocus = () => {
      window.setTimeout(() => settle(null), 1000);
    };
    window.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });

/**
 * 打开系统文件选择框并返回第一个（或唯一）所选 File。
 * - File System Access API 环境原生返回 File（句柄 getFile），取消返回 null；
 * - 其它环境（或 API 调用抛错）降级为动态 input，取消 / 无选返回 null。
 */
export async function pickFile(options: PickFileOptions = {}): Promise<File | null> {
  const { accept, multiple = false } = options;

  // 优先：File System Access API（仅限用户手势中调用；本函数默认在点击处理里触发）
  if (supportsShowOpenFilePicker()) {
    try {
      const picker = (
        window as unknown as {
          showOpenFilePicker: (config?: {
            multiple?: boolean;
            types?: { description?: string; accept: Record<string, string[]> }[];
          }) => Promise<{ getFile: () => Promise<File> }[]>;
        }
      ).showOpenFilePicker;
      const types = accept ? derivePickerTypes(accept) : null;
      const handles = await picker({ multiple, ...(types ? { types } : {}) });
      if (!handles?.length) return null;
      const first = handles[0];
      if (!first) return null;
      const file = await first.getFile();
      return file;
    } catch (err) {
      // 仅「用户取消」返回 null（等价于关闭选择框）；其它异常（如缺手势/参数非法）降级到
      // 动态 input 兜底，避免静默失败导致「点击导入无任何反应」
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      return pickViaInput({ accept, multiple });
    }
  }

  // 降级：动态 input 触发
  return pickViaInput({ accept, multiple });
}
