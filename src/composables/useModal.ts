import type { Chord, Group, ModalActionType } from '@/types';
import { ref } from 'vue';

const modalShow = ref(false);
const modalType = ref<ModalActionType>('');
const modalTitle = ref('');
const modalInput = ref('');
const activeTargetGroup = ref<Group | null>(null);
const activeTargetChord = ref<Chord | null>(null);

export function useModal() {
  const openModal = (
    type: Exclude<ModalActionType, ''>,
    title: string,
    initVal = '',
    targetGroup: Group | null = null,
    targetChord: Chord | null = null
  ) => {
    modalType.value = type;
    modalTitle.value = title;
    modalInput.value = initVal;
    activeTargetGroup.value = targetGroup;
    activeTargetChord.value = targetChord;
    modalShow.value = true;
  };

  const closeModal = () => {
    modalShow.value = false;
  };

  return {
    modalShow,
    modalType,
    modalTitle,
    modalInput,
    activeTargetGroup,
    activeTargetChord,
    openModal,
    closeModal,
  };
}
