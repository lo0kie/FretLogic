import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/workbench',
  },
  {
    path: '/workbench',
    name: 'FretboardWorkbench',
    component: () => import('../views/workbench/WorkbenchView.vue'),
  },
  {
    path: '/score',
    name: 'InteractiveScore',
    component: () => import('../views/score/ScoreView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/workbench',
  },
];

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});
