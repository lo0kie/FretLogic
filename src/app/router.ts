import NProgress from 'nprogress';
import { createRouter, createWebHashHistory } from 'vue-router';

import { ROUTE_PATHS } from '@/platform/utils/constants';

NProgress.configure({ showSpinner: false });

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: ROUTE_PATHS.WORKBENCH },
    {
      path: ROUTE_PATHS.WORKBENCH,
      name: 'FretboardWorkbench',
      component: () => import('@/domains/chord/workbench/components/WorkbenchView.vue'),
    },
    {
      path: ROUTE_PATHS.SCORE,
      name: 'InteractiveScore',
      component: () => import('@/domains/score/editor/components/ScoreView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATHS.WORKBENCH },
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
