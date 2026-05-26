<template>
  <div class="p-4 border-t border-slate-100 dark:border-slate-800 min-w-[335px] bg-slate-50/50 dark:bg-slate-900/20">
    <input type="file" ref="fileInputRef" accept=".json" @change="processImport" class="hidden" />
    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="handleImportTrigger" class="control-bordered">导入备份</ActionButton>
      <ActionButton @click="triggerFullExport" class="control-bordered">全量导出</ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore, type Chord, type Group } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const fileInputRef = ref<HTMLInputElement | null>(null);

const handleImportTrigger = () => fileInputRef.value?.click();

/**
 * 数据清洗与看门狗函数
 */
const cleanAndValidateData = (
  data: any,
  mode: 'import' | 'export' = 'import'
): data is { groups: Group[]; chords: Chord[] } => {
  const logPrefix = mode === 'import' ? '📥 导入校验' : '📤 导出清洗';
  if (!data || typeof data !== 'object') {
    console.error(`❌ ${logPrefix}失败：根节点不是对象。`);
    return false;
  }
  if (!Array.isArray(data.groups) || !Array.isArray(data.chords)) {
    console.error(`❌ ${logPrefix}失败：缺少 "groups" 或 "chords" 数组。`);
    return false;
  }

  let isValid = true;

  // 1. 校验并修补分组 (Group)
  data.groups.forEach((g: any, index: number) => {
    if (!g) {
      console.error(`❌ ${logPrefix} -> 分组列表第 [${index}] 项数据为空白。`);
      isValid = false;
      return;
    }

    const errors: string[] = [];
    if (typeof g.id !== 'string') errors.push(`id 应为 string，实际为 ${typeof g.id}`);
    if (typeof g.name !== 'string') errors.push(`name 应为 string，实际为 ${typeof g.name}`);

    if (g.collapsed === undefined || g.collapsed === null) {
      g.collapsed = false;
    } else if (typeof g.collapsed !== 'boolean') {
      errors.push(`collapsed 应为 boolean，实际为 ${typeof g.collapsed}`);
    }

    if (errors.length > 0) {
      console.error(
        `❌ ${logPrefix} -> 分组异常 [索引 ${index}, 名称 "${g.name || '未知'}"]:\n   `,
        errors.join('\n    ')
      );
      isValid = false;
    }
  });

  const validGroupIds = new Set<string>(
    data.groups.filter((g: any) => g && typeof g.id === 'string').map((g: any) => g.id)
  );

  // 2. 校验、清洗并严格过滤和弦 (Chord)
  const validChords: any[] = [];
  data.chords.forEach((c: any, index: number) => {
    if (!c) {
      console.error(`❌ ${logPrefix} -> 和弦列表第 [${index}] 项数据为空白。`);
      isValid = false;
      return;
    }

    if (c.groupId === null || c.groupId === undefined || String(c.groupId).trim() === '') {
      console.warn(`🗑️ ${logPrefix} -> 和弦 "${c.chordName || '未命名'}" 因缺少 groupId，已执行物理过滤。`);
      return;
    }
    if (!validGroupIds.has(String(c.groupId))) {
      console.warn(
        `🗑️ ${logPrefix} -> 和弦 "${c.chordName || '未命名'}" 指定的分组 "${c.groupId}" 不存在，已执行物理过滤。`
      );
      return;
    }

    const errors: string[] = [];
    if (typeof c.id !== 'number' && typeof c.id !== 'string')
      errors.push(`id 应为 number/string，实际为 ${typeof c.id}`);
    if (typeof c.chordName !== 'string') errors.push(`chordName 应为 string，实际为 ${typeof c.chordName}`);
    if (typeof c.groupId !== 'string') errors.push(`groupId 应为 string，实际为 ${typeof c.groupId}`);

    // 次要字段容错补全
    if (c.fretCount === undefined || c.fretCount === null) c.fretCount = 3;
    if (c.capo === undefined || c.capo === null) c.capo = 0;

    // 🌟 资产看门狗新增：对 rootMark 属性的安全防御清洗与防爆闸
    if (c.rootMark === undefined || c.rootMark === null) {
      c.rootMark = null; // 容错修补
    } else if (typeof c.rootMark === 'number') {
      if (c.rootMark !== -1 && (c.rootMark < 0 || c.rootMark > 5)) {
        errors.push(`rootMark 手动主音弦号超出了六弦合法区间 [0, 5]，实际为: ${c.rootMark}`);
      }
    } else {
      errors.push(`rootMark 字段发生畸变，应为 number 或 null，实际为: ${typeof c.rootMark}`);
    }

    if (typeof c.fretCount !== 'number' || c.fretCount < 3 || c.fretCount > 8) {
      errors.push(`fretCount 品格数超出安全显示区间 [3, 8]，实际为 ${c.fretCount}`);
    }
    if (typeof c.capo !== 'number' || c.capo < 0 || c.capo > 15) {
      errors.push(`capo 变调夹品数超出合理吉他范围，实际为 ${c.capo}`);
    }

    if (!Array.isArray(c.selectedFrets)) {
      errors.push(`selectedFrets 应为数组，实际为 ${typeof c.selectedFrets}`);
    } else {
      if (c.selectedFrets.length !== 6) {
        errors.push(`selectedFrets 长度应为 6 根弦，实际为 ${c.selectedFrets.length}`);
      } else if (!c.selectedFrets.every((f: any) => typeof f === 'number')) {
        errors.push(`selectedFrets 内部存在非纯数字项`);
      } else {
        const outOfRange = c.selectedFrets.some((fret: number) => fret < -1 || fret > c.fretCount);
        if (outOfRange) {
          errors.push(
            `selectedFrets 存在越界品位值，有效品位须在 [-1, ${c.fretCount}] 内，实际数据为: [${c.selectedFrets.join(', ')}]`
          );
        }
      }
    }

    if (errors.length > 0) {
      console.error(
        `❌ ${logPrefix} -> 和弦数据严重损坏 [索引 ${index}, 名称 "${c.chordName || '未命名'}"]:\n   `,
        errors.join('\n    ')
      );
      isValid = false;
      return;
    }

    validChords.push(c);
  });

  data.chords = validChords;
  return isValid;
};

const processImport = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      if (ev.target?.result) {
        const imported = JSON.parse(ev.target.result as string);
        if (cleanAndValidateData(imported, 'import')) {
          chordLabStore.groups = imported.groups;
          chordLabStore.savedChordsList = imported.chords;
          if (!chordLabStore.groups.some(g => g.id === chordLabStore.selectedGroupId)) {
            chordLabStore.selectedGroupId = chordLabStore.groups[0]?.id || null;
          }
          uiStore.showToast('📥 数据恢复成功');
        } else {
          throw new Error('Import verification failed');
        }
      }
    } catch (err) {
      console.error('备份解析拦截:', err);
      uiStore.showToast('❌ 文件非标准和弦备份或核心数据已损坏');
    } finally {
      target.value = '';
    }
  };
  reader.readAsText(target.files[0]);
};

const triggerFullExport = () => {
  const originalData = {
    groups: chordLabStore.groups,
    chords: chordLabStore.savedChordsList,
  };
  if (cleanAndValidateData(originalData, 'export')) {
    chordLabStore.savedChordsList = originalData.chords;
    const link = document.createElement('a');
    const dataString = JSON.stringify({ groups: originalData.groups, chords: originalData.chords });

    link.href = URL.createObjectURL(new Blob([dataString], { type: 'application/json' }));
    link.download = `和弦备份_${Date.now()}.json`;
    link.click();
    uiStore.showToast('📤 备份已下载');
  } else {
    uiStore.showToast('❌ 当前本地缓存存在严重破损数据，请检查控制台');
  }
};
</script>
