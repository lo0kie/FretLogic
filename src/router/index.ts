import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Workbench',
    component: () => import('../views/workbench/WorkbenchView.vue'),
  },
  {
    path: '/score',
    name: 'Score',
    component: () => import('../views/score/ScoreView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
