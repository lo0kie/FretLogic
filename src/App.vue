<script setup lang="tsx">
import BaseCard from '@/components/BaseCard.vue';
import BaseModal from '@/components/BaseModal.vue';
import ChordList from '@/components/ChordList.vue';
import ChordNameInput from '@/components/ChordNameInput.vue';
import ControlButton from '@/components/ControlButton.vue';
import FretBoard from '@/components/FretBoard.vue';
import SmallControlButton from '@/components/SmallControlButton.vue';
import ToastMessage from '@/components/ToastMessage.vue';
import { provide, ref } from 'vue';

import BaseInput from '@/components/BaseInput.vue';
import GroupTabs from '@/components/GroupTabs.vue';
import useChordGroupStore from '@/store/chordGroup';
import useGlobalStore from '@/store/global';
import useModalStore from '@/store/modal';
import useToastStore from '@/store/toast';

const globalStore = useGlobalStore();
const toastStore = useToastStore();
const modalStore = useModalStore();
const chordGroupStore = useChordGroupStore();

provide('isDarkMode', globalStore.isDarkMode);

function createGroup() {
  const groupName = ref('');

  modalStore
    .show({ title: '新建分组', message: <BaseInput placeholder='分组名' autoFocus v-model={groupName.value} /> })
    .confirm(() => {
      if (groupName.value.length === 0) {
        toastStore.addToast({ msg: '文本为空' });
      } else if (chordGroupStore.groups.find(({ name }) => name === groupName.value)) {
        toastStore.addToast({ msg: '命名重复' });
      } else {
        modalStore.hide();
        chordGroupStore.createGroup(groupName.value);
        toastStore.addToast({ msg: '新建成功' });
      }
    })
    .cancel(() => {
      modalStore.hide();
    });
}

function importChords() {
  const groupIndex = ref(0);

  if (chordGroupStore.groups.length === 0) {
    toastStore.addToast({ msg: '先新建分组' });
  } else {
    modalStore
      .show({
        title: '选择导入至',
        message: (
          <GroupTabs modelValue={groupIndex.value} onUpdateModelValue={(val: number) => (groupIndex.value = val)} />
        ),
      })
      .confirm(() => {
        // 1. 获取目标分组（根据你当前选中的索引）
        const targetGroup = chordGroupStore.groups[groupIndex.value];

        // 2. 构造当前录入的和弦数据
        // 根据你之前的需求，这里应该是将当前 FretBoard 上的状态保存下来
        const newChord = {
          name: globalStore.chordName,
          selectedFrets: [...globalStore.selectedFrets],
          capo: globalStore.capo,
          id: Date.now().toString(), // 临时生成一个唯一 ID
        };

        // 3. 执行导入逻辑：将 ID 存入分组的 chordIds 列表
        // 注意：这里需要确保 chordGroupStore.groups 是响应式的
        if (!targetGroup.chords.includes(newChord.id)) {
          targetGroup.chords.push(newChord);

          // 如果你本地还有一个存储所有和弦详情的地方，记得一并存入
          // chordStore.addChord(newChord);

          toastStore.addToast({ msg: `成功导入至 [${targetGroup.name}]` });
          modalStore.hide();
        } else {
          toastStore.addToast({ msg: '分组内已存在该和弦' });
        }
      })
      .cancel(() => {
        modalStore.hide();
      });
  }
}

function exportChords() {
  const groupIndex = ref(0);

  if (chordGroupStore.groups.length === 0) {
    toastStore.addToast({ msg: '先新建分组' });
  } else {
    modalStore
      .show({
        title: '选择导出的分组',
        message: (
          <GroupTabs modelValue={groupIndex.value} onUpdateModelValue={(val: number) => (groupIndex.value = val)} />
        ),
      })
      .confirm(() => {
        if (chordGroupStore.groups[groupIndex.value].chords.length === 0) {
          toastStore.addToast({ msg: '该分组没有和弦' });
        } else {
          toastStore.addToast({ msg: '成功' });
          modalStore.hide();
        }
      })
      .cancel(() => {
        modalStore.hide();
      });
  }
}
</script>

<template>
  <BaseModal />
  <ToastMessage />

  <div class="flex flex-row gap-6 items-start">
    <BaseCard width="600px" height="780px">
      <template #header>
        <ChordNameInput v-model:text.trim="globalStore.chordName" />
      </template>

      <FretBoard v-model:selected-frets="globalStore.selectedFrets" :capo="globalStore.capo" />
    </BaseCard>

    <BaseCard width="420px" height="780px">
      <template #header>
        <div class="p-6 w-full flex items-center border-b border-slate-100 justify-between">
          <span class="text-[14px] font-black opacity-30 tracking-widest uppercase">和弦库</span>
          <div class="flex gap-2">
            <SmallControlButton
              is-toggle
              v-model:active="globalStore.isPreviewMode"
              active-tooltip="开启预览"
              inactive-tooltip="关闭预览"
              active-icon="👁️"
            />
            <SmallControlButton @click="createGroup" active-tooltip="新建分组" active-icon="📁" />
            <SmallControlButton @click="importChords" active-tooltip="导入和弦" active-icon="📂" />
            <SmallControlButton @click="exportChords" active-tooltip="导出和弦" active-icon="💾" />
            <SmallControlButton
              is-toggle
              v-model:active="globalStore.isDarkMode"
              active-tooltip="亮色主题"
              inactive-tooltip="暗色主题"
              active-icon="☀️"
              inactive-icon="🌙"
            />
          </div>
        </div>
      </template>

      <ChordList />

      <template #footer>
        <div class="w-full p-6 border-t border-slate-100 flex gap-6">
          <ControlButton text="清空" type="secondary" />
          <ControlButton text="保存" />
        </div>
      </template>
    </BaseCard>
  </div>
</template>
