import ScoreView from '@/views/score/ScoreView.vue';
import WorkbenchView from '@/views/workbench/WorkbenchView.vue.vue';
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Workbench',
    component: WorkbenchView,
  },
  {
    path: '/score',
    name: 'Score',
    component: ScoreView,
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
