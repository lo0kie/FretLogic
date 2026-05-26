import App from '@/App.vue';
import '@/assets/styles/main.less'; // 导入全局样式皮肤
import { createPinia } from 'pinia';
import { createApp } from 'vue';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
