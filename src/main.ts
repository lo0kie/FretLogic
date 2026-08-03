import App from '@/App.vue';
import '@/assets/main.less';
import { router } from '@/router';
import { useEditorStore } from '@/stores/chordEditorStore';
import { createPinia } from 'pinia';
import VWave from 'v-wave';
import { createApp } from 'vue';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

// 🌟 显式初始化编辑器状态（原来是 store 创建时的隐式副作用）
useEditorStore(pinia).initEditor();

app.use(VWave, { easing: 'ease-out' });
app.use(router);
app.mount('#app');
