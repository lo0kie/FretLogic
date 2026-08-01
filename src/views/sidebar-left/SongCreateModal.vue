<template>
  <BaseModal
    v-model:visible="songModals.isSongCreateOpen.value"
    title="新建乐谱"
    @confirm="songModals.handleCreateSong"
  >
    <BaseInput
      v-model="songModals.newSongTitle.value"
      placeholder="请输入乐谱名称..."
      clearable
      autofocus
      @enter="songModals.handleCreateSong"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import { useSongModals } from '@/services/useSongModals';

defineProps<{
  songModals: ReturnType<typeof useSongModals>;
}>();
</script>
