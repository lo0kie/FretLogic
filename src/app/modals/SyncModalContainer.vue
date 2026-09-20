<template>
  <BaseModal v-model:visible="isSyncModalOpen" :close-locked="!modalCloseable" title="同步设置">
    <template #header-extra>
      <BaseSelector v-model="selectedProvider" :disabled="!modalCloseable" :options="providerOptions" />
    </template>

    <template #default>
      <!-- BaseForm 以 tag="form" 渲染（不可退回默认的 div）：本弹窗是全仓唯一出现 type="password" 的地方
           （GitHub / Gitee / 服务器 Token 与 WebDAV 密码共 4 处），而这两个字段组此前都没有表单归属。
           Chrome 对「无 form 的密码框」会打 `[DOM] Password field is not contained in a form`；提醒本身
           无害，但它指向的真实问题是：密码管理器只能靠启发式猜这串字符属于哪组凭据 —— WebDAV 的账号密码
           是真凭据，有 form 才谈得上正确保存/回填；Token 那几个字段则继续靠 BaseInput 上的 data-*-ignore
           + autocomplete="off" 拦住第三方管理器。
           `@submit.prevent` 与 form 同等必要：表单内只有一个「可阻止隐式提交」字段时（Token 那几个方案
           正好只有一个输入框），浏览器会因回车触发提交，未拦截即整页导航，SPA 直接被刷掉。此处刻意不把
           submit 绑到任何动作 —— 在 Token 框里回车不应默默把本地数据推到云端。
           间距沿用容器默认档 md（与原 div 的 gap-md 一致）；容器未下发 size，控件尺寸解析仍回落到默认 md，
           与本弹窗改用容器之前一致。 -->
      <BaseForm @submit.prevent tag="form">
        <div
          class="sync-panel-card flex w-full flex-col gap-md rounded-lg border border-glass-border bg-surface-panel p-md"
        >
          <div class="panel-header flex items-center justify-between">
            <h3 class="panel-title m-0 text-xs font-semibold text-fg-body">云端同步</h3>
          </div>

          <template v-if="selectedProvider === 'server'">
            <div class="flex flex-col gap-sm py-xs">
              <BaseInput
                v-model="settingsStore.serverToken"
                :disabled="isBusy"
                :maxlength="100"
                clearable
                is-password
                show-count
                placeholder="服务器 Token"
                width="auto"
              />
              <p class="form-hint m-0">
                上传数据时通过 Authorization 请求头携带 Token；拉取与测试连接无需 Token。Token
                仅本次会话内存持有，刷新页面后需重新填写。
              </p>
            </div>
          </template>

          <template v-else-if="selectedProvider === 'github'">
            <div class="flex flex-col gap-sm py-xs">
              <BaseInput
                v-model="settingsStore.githubToken"
                :disabled="isBusy"
                :maxlength="100"
                clearable
                is-password
                show-count
                placeholder="GitHub Token (ghp_...)"
                width="auto"
              />

              <p class="form-hint m-0">提示：推送写回分支需配置 Token；拉取公开分支无需 Token。</p>
            </div>
          </template>

          <template v-else-if="selectedProvider === 'gitee'">
            <div class="flex flex-col gap-sm py-xs">
              <BaseInput
                v-model="settingsStore.giteeToken"
                :disabled="isBusy"
                :maxlength="100"
                clearable
                is-password
                show-count
                placeholder="Gitee 私人令牌 (Token)"
                width="auto"
              />

              <p class="form-hint m-0">
                提示：数据同步至 Gitee 仓库 look1e/fret-logic 的 backup/chords.json。需先在 Gitee 「私人令牌」页创建
                Token；私有仓库拉取同样需要 Token。
              </p>
              <p class="form-hint m-0">
                安全说明：Token 仅在浏览器本地存储，通过 Authorization 请求头经 HTTPS 加密传输，不经由 URL 参数暴露。
              </p>
            </div>
          </template>

          <template v-else-if="selectedProvider === 'webdav'">
            <div class="flex flex-col gap-sm py-xs">
              <BaseInput
                v-model="settingsStore.webdavServerUrl"
                :disabled="isBusy"
                :maxlength="200"
                clearable
                show-count
                placeholder="WebDAV 服务器根地址 (例如 https://dav.example.com)"
                width="auto"
              />

              <BaseInput
                v-model="settingsStore.webdavUsername"
                :disabled="isBusy"
                :maxlength="100"
                clearable
                show-count
                placeholder="用户名 (可选)"
                width="auto"
              />

              <BaseInput
                v-model="settingsStore.webdavPassword"
                :disabled="isBusy"
                :maxlength="100"
                clearable
                is-password
                show-count
                placeholder="密码"
                width="auto"
              />
            </div>
          </template>
        </div>

        <div v-if="selectedProvider === 'webdav'" class="flex flex-col gap-xs px-xs">
          <div class="flex items-center justify-between py-0.5">
            <span class="text-xs font-medium text-fg-body">使用预设代理</span>
            <BaseSwitch v-model="settingsStore.webdavUseDefaultProxy" :disabled="isBusy" aria-label="使用预设代理" />
          </div>

          <BaseInput
            v-if="!settingsStore.webdavUseDefaultProxy"
            v-model="settingsStore.webdavProxyUrl"
            :disabled="isBusy"
            :maxlength="200"
            clearable
            show-count
            placeholder="自定义代理地址 (留空则直连)"
            width="auto"
          />

          <p class="form-hint m-0">
            {{
              settingsStore.webdavUseDefaultProxy
                ? '已启用预设代理（由作者维护的 Cloudflare Worker 转发，以绕开浏览器跨域限制）。如介意可关闭并填入自建代理或直连。'
                : '关闭预设代理后可填写自定义代理，留空则由浏览器直接连接（若 WebDAV 服务未配置 CORS 头，直连可能失败）。'
            }}
          </p>
          <p
            v-if="settingsStore.webdavUseDefaultProxy || Boolean(settingsStore.webdavProxyUrl)"
            class="form-hint m-0 text-warning"
          >
            安全提示：启用代理时，WebDAV 账号与密码（Basic 认证凭据）将经由代理中转。若包含敏感数据，建议在 WebDAV
            服务器直接配置 CORS 支持直连，或部署自建代理。
          </p>
        </div>
      </BaseForm>
    </template>

    <template #footer>
      <ActionButton
        v-for="action in syncActionButtons"
        v-tooltip="action.tooltip"
        :disabled="action.disabled"
        :icon="action.icon"
        :key="action.key"
        :label="action.label"
        :loading="action.loading"
        @click="action.onClick"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, onMounted, toRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { preloadSyncActions, useSyncService } from '@/app/services/sync/useSyncService';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { prefetch } from '@/platform/utils/prefetch';

import type { SyncProviderKind } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { BaseSelectorOption } from '@/platform/ui/selector/BaseSelector.vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });
const { triggerGlobalSync, pullFromRemote, testConnection, isSyncing, isPulling, isTestingConnection } =
  useSyncService();
// 弹窗打开即预取同步动作 chunk：用户点「测试连接/推送/拉取」时模块已在缓存，busy 立即翻转；
// 经 prefetch 吞掉失败，避免弱网下产生未处理 rejection
onMounted(() => prefetch(preloadSyncActions, 'SyncModalContainer'));
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const backupModals = useBackupModals();

// 弹窗内方案选择器：独立持久化（不联动全局 syncTarget，仅记录弹窗当前查看/操作的方案）
const selectedProvider = toRef(uiStore, 'syncModalProvider');

/** 用户点击"同步"：按当前选中的方案推送本地数据，成功后关闭弹窗 */
const handleSyncClick = async () => {
  const ok = await triggerGlobalSync(selectedProvider.value);
  if (ok) isSyncModalOpen.value = false;
};

/** 用户点击"拉取"：按当前选中的方案拉取云端数据，成功后关闭弹窗并进入导入面板 */
const handlePullClick = async () => {
  const payload = await pullFromRemote(selectedProvider.value);
  if (payload) {
    isSyncModalOpen.value = false;
    backupModals.openImportWithPayload(payload, '云端同步数据');
  }
};

const providerOptions: BaseSelectorOption<SyncProviderKind>[] = [
  { label: '线上服务器', value: 'server', icon: 'server' },
  { label: 'GitHub', value: 'github', icon: 'github' },
  { label: 'Gitee', value: 'gitee', icon: 'git-branch' },
  { label: 'WebDAV', value: 'webdav', icon: 'folder-sync' },
];

/** 任一同异步操作进行中时，锁定全部操作按钮并禁止关闭弹窗 */
const isBusy = computed(() => isSyncing.value || isPulling.value || isTestingConnection.value);

const modalCloseable = computed(() => !isBusy.value);

// 拉取配置禁用判断：服务器与预设 GitHub 随时可拉取，WebDAV 需填服务器地址
const isPullDisabled = computed(() => {
  if (selectedProvider.value === 'webdav') return !settingsStore.webdavServerUrl.trim();
  return false;
});

// 同步（推送）配置禁用判断：GitHub/Gitee/Server 需填 Token，WebDAV 需填服务器地址与密码
const isSyncDisabled = computed(() => {
  if (selectedProvider.value === 'github') return !settingsStore.githubToken.trim();
  if (selectedProvider.value === 'gitee') return !settingsStore.giteeToken.trim();
  if (selectedProvider.value === 'server') return !settingsStore.serverToken.trim();
  if (selectedProvider.value === 'webdav')
    return !settingsStore.webdavServerUrl.trim() || !settingsStore.webdavPassword.trim();
  return false;
});

/** 用户点击"测试连接"：对当前选中的方案做连通性验证（不读写数据） */
const handleTestConnectionClick = async () => {
  await testConnection(selectedProvider.value);
};

// 测试连接禁用判断：WebDAV 需填服务器地址，服务器与预设 GitHub 随时可测
const isTestDisabled = computed(() => {
  if (selectedProvider.value === 'webdav') return !settingsStore.webdavServerUrl.trim();
  return false;
});

/** 测试连接按钮提示：按测试中状态与配置完整性给说明 */
const testConnectionTooltip = computed(() => {
  if (isTestingConnection.value) return '测试中';
  if (isBusy.value) return '其他操作进行中';
  if (isTestDisabled.value) return '请先填写 WebDAV 服务器地址';
  return '验证云端地址与凭据（不读写数据）';
});

/** 拉取按钮提示：按拉取状态与配置完整性给说明 */
const pullTooltip = computed(() => {
  if (isPulling.value) return '同步中';
  if (isBusy.value) return '其他操作进行中';
  if (isPullDisabled.value) return '请先填写 WebDAV 服务器地址';
  return '从云端获取数据并弹窗确认导入';
});

/** 同步按钮提示：按同步状态与配置完整性给说明 */
const syncTooltip = computed(() => {
  if (isSyncing.value) return '同步中';
  if (isBusy.value) return '其他操作进行中';
  if (isSyncDisabled.value) {
    if (selectedProvider.value === 'github') return '推送写回分支需先填写 GitHub Token';
    if (selectedProvider.value === 'gitee') return '推送写回仓库需先填写 Gitee Token';
    if (selectedProvider.value === 'server') return '推送上传需先填写服务器 Token';
    return '请先填写 WebDAV 服务器地址和密码';
  }
  return '将本地数据推送到云端';
});

/** 底部操作按钮组：测试连接 / 拉取 / 同步 —— 结构一致（图标+文案+tooltip+禁用+加载+点击），
 *  差异字段化后由模板 v-for 渲染。经 computed 求值并展开为纯值，模板无需解包 ref */
type SyncActionButton = {
  key: 'test-connection' | 'pull' | 'sync';
  icon: IconName;
  label: string;
  tooltip: string | undefined;
  disabled: boolean;
  loading: boolean;
  onClick: () => void | Promise<void>;
};

const syncActionButtons = computed<SyncActionButton[]>(() => [
  {
    key: 'test-connection',
    icon: 'plug-zap',
    label: '测试连接',
    tooltip: testConnectionTooltip.value,
    disabled: isTestDisabled.value || isBusy.value,
    loading: isTestingConnection.value,
    onClick: handleTestConnectionClick,
  },
  {
    key: 'pull',
    icon: 'cloud-download',
    label: '拉取',
    tooltip: pullTooltip.value,
    disabled: isPullDisabled.value || isBusy.value,
    loading: isPulling.value,
    onClick: handlePullClick,
  },
  {
    key: 'sync',
    icon: 'refresh-cw',
    label: '同步',
    tooltip: syncTooltip.value,
    disabled: isSyncDisabled.value || isBusy.value,
    loading: isSyncing.value,
    onClick: handleSyncClick,
  },
]);
</script>
