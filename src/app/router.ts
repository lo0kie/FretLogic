import { createRouter, createWebHashHistory } from 'vue-router';

import NProgress from 'nprogress';

NProgress.configure({ showSpinner: false });

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/workbench' },
    {
      path: '/workbench',
      name: 'FretboardWorkbench',
      component: () => import('@/features/workbench/WorkbenchView.vue'),
    },
    {
      path: '/score',
      name: 'InteractiveScore',
      component: () => import('@/features/score-editor/ScoreView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/workbench' },
  ],
});

router.beforeEach((to, from, next) => {
  if (to.path !== from.path) {
    NProgress.start();
  }
  next();
});

router.afterEach(() => {
  NProgress.done();
});

router.onError(() => {
  NProgress.done();
});
