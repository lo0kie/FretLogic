import App from '@/App.vue';
import { router } from '@/router';
import { useEditorStore } from '@/stores/chordEditorStore';
import { createPinia } from 'pinia';
import VWave from 'v-wave';
import { createApp } from 'vue';

import '@/assets/main.less';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(VWave, { easing: 'ease-out' });
app.use(router);
app.mount('#app');

try {
  useEditorStore(pinia).initEditor();
} catch (error) {
  console.error('初始化编辑器时出错:', error);
}
