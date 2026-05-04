<script setup lang="tsx">
// 逻辑部分保持不变
import useChordGroupStore from '@/store/chordGroup';
import useModalStore from '@/store/modal';
import useToastStore from '@/store/toast';

const toastStore = useToastStore();
const groupStore = useChordGroupStore();
const modalStore = useModalStore();

function handelClickTitle(id: string) {
  groupStore.currentGroupId = groupStore.currentGroupId === id ? '' : id;
}

function handelDeleteGroup(_id: string) {
  const group = groupStore.groups.find(({ id }) => id === _id);
  modalStore
    .show({
      title: '删除分组',
      message: `确定要删除“${group?.name}”及其包含的所有和弦吗？`,
    })
    .confirm(() => {
      groupStore.deleteGroup(_id);
      modalStore.hide();
      toastStore.addToast({ msg: '已成功移除分组' });
    })
    .cancel(() => modalStore.hide());
}
</script>

<template>
  <!-- 容器：增加平滑滚动 -->
  <div class="w-full h-full overflow-y-auto no-scrollbar select-none p-6 flex-1 scroll-smooth">
    <TransitionGroup name="list">
      <template v-for="{ name, chords, id } in groupStore.groups" :key="id">
        <!-- 分组标题：iOS 18 风格的响应式容器 -->
        <div
          @click="handelClickTitle(id)"
          class="group-title flex justify-between items-center px-4 py-3 mb-2 rounded-[18px] transition-all duration-300 cursor-pointer active:scale-[0.98]"
          :class="[
            groupStore.currentGroupId === id
              ? 'bg-blue-50/50 dark:bg-blue-900/20 shadow-[0_4px_12px_rgba(37,99,235,0.08)]'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
          ]"
        >
          <div class="flex items-center gap-3">
            <!-- 状态箭头 -->
            <span
              class="text-[8px] transition-transform duration-300 text-slate-400"
              :class="{ 'rotate-180 text-blue-500': groupStore.currentGroupId === id }"
              >▼</span
            >

            <span
              class="text-[15px] font-bold tracking-tight transition-colors duration-300"
              :class="groupStore.currentGroupId === id ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'"
            >
              {{ name }}
            </span>

            <!-- 胶囊角标 -->
            <span
              class="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/50 dark:bg-slate-700/50 text-slate-400 font-medium"
            >
              {{ chords.length }}
            </span>
          </div>

          <!-- 删除按钮：更有呼吸感的显示方式 -->
          <button
            @click.stop="handelDeleteGroup(id)"
            class="delete-button px-3 py-1 rounded-lg text-[12px] text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
          >
            删除
          </button>
        </div>

        <!-- 和弦网格容器 -->
        <Transition name="expand">
          <div v-if="groupStore.currentGroupId === id" class="px-2 mb-6 overflow-hidden">
            <!-- 空状态 -->
            <div
              v-if="chords.length === 0"
              class="py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[24px] flex items-center justify-center group/empty"
            >
              <p
                class="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300 group-hover/empty:text-slate-400 transition-colors"
              >
                Empty Library
              </p>
            </div>

            <!-- 数据网格 -->
            <div v-else class="grid grid-cols-3 gap-3">
              <div
                v-for="(chord, idx) in chords"
                :key="chord._localId || idx"
                class="flex flex-col items-center justify-center aspect-[1.3/1] bg-slate-50 dark:bg-slate-800/50 rounded-[20px] border-2 border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 active:scale-95"
              >
                <span class="text-lg font-black italic text-slate-800 dark:text-slate-200 tracking-tighter">
                  {{ chord.name }}
                </span>
                <!-- 底部装饰小点：表示该和弦有指法数据 -->
                <div class="flex gap-1 mt-1">
                  <div v-for="n in 3" class="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </template>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="less">
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.group-title {
  .delete-button {
    opacity: 0;
    transform: translateX(10px);
  }
  &:hover {
    .delete-button {
      opacity: 1;
      transform: translateX(0);
    }
  }
}

/* 列表动画 */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
