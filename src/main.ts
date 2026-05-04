import { createPinia } from 'pinia';
import persist from 'pinia-plugin-persistedstate';
import { createApp } from 'vue';
import App from './App.vue';
import '@/styles/base.less';

const app = createApp(App);
const pinia = createPinia();

pinia.use(persist);

app.use(pinia);
app.mount('#app');
