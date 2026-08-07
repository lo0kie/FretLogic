import NProgress from 'nprogress';
import { createRouter, createWebHashHistory } from 'vue-router';

NProgress.configure({ showSpinner: false });

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/workbench' },
    { path: '/workbench', name: 'FretboardWorkbench', component: () => import('../views/workbench/WorkbenchView.vue') },
    { path: '/score', name: 'InteractiveScore', component: () => import('../views/score/ScoreView.vue') },
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
