<template>
  <div ref="referenceRef" class="relative inline-block" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && content"
          ref="floatingRef"
          class="tooltip-box fixed px-3 py-1.5 font-black rounded-lg text-xs shadow-xl pointer-events-none"
          :style="floatingStyles"
          v-html="sanitizedHtmlContent"
        ></div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
  }>(),
  { placement: 'top' }
);

const show = ref(false);
const referenceRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

const sanitizedHtmlContent = computed(() => {
  if (!props.content) return '';

  const rawHtml = props.content.replace(/\\n/g, '<br />').replace(/\n/g, '<br />');

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');

    const scripts = doc.querySelectorAll('script, img, iframe, object, embed, svg');
    scripts.forEach(el => el.remove());

    const allElements = doc.body.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = el.attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        if (attrs[i].name.startsWith('on')) {
          el.removeAttribute(attrs[i].name);
        }
      }
    });

    return doc.body.innerHTML;
  } catch (e) {
    console.error('Tooltip XSS Sandbox Guard Error:', e);
    return '';
  }
});

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  whileElementsMounted: (reference, floating, update) => {
    return autoUpdate(reference, floating, update);
  },
  middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 6 })],
});
</script>

<style scoped lang="less">
.tooltip-box {
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 9999;
  transition: opacity 0.12s ease-out;
  white-space: nowrap;
  line-height: 1.6;
  text-align: center;
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: opacity 0.12s ease-out;
}
.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0 !important;
}
</style>
