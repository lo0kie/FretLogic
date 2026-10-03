import NProgress from 'nprogress';
import { createRouter, createWebHashHistory } from 'vue-router';

import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

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
  if (to.path !== from.path) NProgress.start();

  next();
});

router.afterEach(() => void NProgress.done());
// 懒路由 chunk 加载失败（新版本部署后旧 index.html 引用了已删除的 chunk）会走到这里：
// 原先只关进度条，用户看到的是「点了没反应 / 停在原页」，既无提示也无重载入口。
router.onError((error, to) => {
  void NProgress.done();
  logger.error('router', '路由加载失败', error);
  useUiStore().message.error('页面加载失败，请刷新后重试', { description: `目标：${to.fullPath}` });
});
