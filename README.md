# FretLogic

吉他和弦推导与交互式歌词排版 Web 应用。

👉 **在线体验**：[lo0kie.github.io/FretLogic](https://lo0kie.github.io/FretLogic/#/workbench)

## 💡 主要功能

- **指板交互与和弦推导**：支持 3/4 品指板切换、Capo 变调夹、8 种特殊调音与智能和弦推导，自动识别转位与根音。
- **歌词和弦排版**：支持歌词编辑与和弦拖拽挂载（字符级 / 行首行尾），支持撤销重做历史栈。
- **高清乐谱导出**：一键导出长图/PDF，内置 A4 智能分页与剪贴板复制。
- **真实扫弦试听**：基于 Tone.js 实现吉他扫弦模拟与混响效果。
- **数据云同步**：支持 JSON 本地导入导出与 GitHub API 云端无缝备份。

## 🛠️ 技术栈

- Vue 3 / TypeScript / Vite / Pinia
- Tone.js / html-to-image / jsPDF / Floating UI / VueUse

## 🚀 本地运行

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev

# 打包构建（含类型检查）
pnpm build

# 格式化全部文件
pnpm format

# 检查格式
pnpm format:check
```

## 📁 目录结构

```
src/
├── components/     # 通用基础组件（BaseInput / BaseSelector / BaseModal 等）与指板组件
├── constants/      # 常量统一管理（音频 / 指板 / 布局 / 打印 / 存储 / 主题），均带中文注释
│   └── index.ts    # 桶文件，统一 re-export
├── directives/     # 自定义指令（vTooltip 等）
├── router/         # 路由与滚动记忆
├── services/       # 组合式函数（指板交互 / 导入导出 / GitHub 同步 / 乐谱导出 等）
├── stores/         # Pinia 状态（chordStore / chordEditorStore / songStore / scoreEditorStore 等）
├── types/          # 核心类型定义（chord / song / ui / engine）
├── utils/          # 纯函数工具（音乐理论 / 和弦引擎 / 校验 / 分页 等）
└── views/          # 页面视图
    ├── header-top/     # 顶部工具栏（配置 / 同步 / 工具）
    ├── sidebar-left/   # 左侧栏（分组 / 歌曲列表 / 和弦卡片）
    ├── score/          # 乐谱编辑与预览
    └── workbench/      # 工作台（指板 / 和弦分析）
```

## 🧱 核心数据模型

所有数据统一使用 `camelCase` 字段，经 `src/utils/validatePayload.ts` 校验、归一化后持久化。

### Chord（和弦）

```ts
interface Chord {
  id: string;
  chordName: string;        // 和弦名，如 "Cmaj7"
  strings: GuitarStringEntity[]; // 六根弦，固定 6 项
  fretCount: 3 | 4;         // 指板品数
  capo: number;             // 变调夹
  groupId: string;          // 所属分组
  tuning: Tuning;           // 调音枚举（STANDARD / DROP_D / ...）
  rootStringIndex: number | null; // 根音所在弦索引，null 表示未指定
}

interface GuitarStringEntity {
  fret: number;        // -1 静音，0 空弦，>=1 按品
  preferFlat: boolean; // 该弦音名偏好降号（如 Bb 而非 A#）
}
```

设计要点：

- **单点根音标记**：根音用 `rootStringIndex` 单点标记，不再每根弦各自维护 `isRoot`。
- **派生字段实时计算**：音名标签、转位判定、指纹等均为派生数据，由 `src/utils/musicTheory.ts` 实时计算，不落盘存储，杜绝不一致。
- **版本化迁移**：数据带 `version` 字段，`migratePayloadVersion` + `PAYLOAD_MIGRATIONS` 负责旧版本数据自动升级。

### Group（分组）

```ts
interface Group {
  id: string;
  name: string;
  sortRule: GroupSortRule;  // 枚举：ROOT_PITCH / KEY_DEGREE / NAME_ASC
  sortKey?: string;         // 调内级数排序时的目标调性
}
```

### Song（歌曲）

```ts
interface Song {
  id: string;
  title: string;
  lyrics: string;
  lineIds: string[];        // 行顺序索引
  key: string;              // 原调
  playKey: string;          // 实际演奏调
  capo: number;
  chordMap: Record<string, string>; // 行/字符 → 和弦名映射
}
```

## 🔧 关键约定

- **尺寸预设**：尺寸类属性遵循项目 `'sm' | 'md' | 'lg'` 预设约定，映射关系集中在 `constants/fretboard.ts`（如 `CHORD_NAME_FONT_SIZE_MAP`）。
- **枚举强约束**：可枚举的字符串联合（排序规则 / Toast 类型 / 导出模式等）统一使用字符串枚举，配合 `Object.values()` 做运行时校验。
- **常量集中管理**：所有魔法数字/字符串收拢到 `src/constants/` 并附中文注释，杜绝散落字面量。
- **单一事实源**：存储层只保存最小不可再分的数据，展示/排序类信息一律派生。

## 📝 提交规范

```bash
# 格式化后提交
pnpm format
git add -A
git commit -F .temp/commit_msg.txt   # 提交信息写入临时文件，避免 shell 解析问题
```

## License

[MIT](https://www.google.com/search?q=LICENSE)
