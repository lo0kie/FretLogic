import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { cleanAndValidateData } from '@/utils/dataParser';

export function useGithubSyncService() {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const chordStore = useChordStore();

  // 支持中文的 Base64 编码与解码
  const utf8ToBase64 = (str: string) => {
    return window.btoa(unescape(encodeURIComponent(str)));
  };

  const base64ToUtf8 = (str: string) => {
    return decodeURIComponent(escape(window.atob(str)));
  };

  // 移除非 ISO-8859-1 字符的安全清洗函数
  const cleanHeaderString = (str: string) => {
    return str.trim().replace(/[^\x00-\x7F]/g, '');
  };

  const syncToGithub = async (data: object) => {
    const githubToken = cleanHeaderString(settingsStore.githubToken);
    const githubOwner = settingsStore.githubOwner.trim();
    const githubRepo = settingsStore.githubRepo.trim();
    const githubBranch = settingsStore.githubBranch.trim();
    const githubPath = settingsStore.githubPath.trim();

    if (!githubToken || !githubOwner || !githubRepo || !githubBranch || !githubPath) {
      uiStore.showToast('❌ 同步失败：请先在右侧栏配置完整的 GitHub 信息', false, 'error');
      return;
    }

    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    try {
      uiStore.showToast('☁️ 正在后台同步到 GitHub...', false, 'loading');

      let fileSha = '';
      const getRes = await fetch(`${apiUrl}?ref=${githubBranch}`, { method: 'GET', headers });

      if (getRes.ok) {
        const getResJson = await getRes.json();
        fileSha = getResJson.sha;
      } else if (getRes.status !== 404) {
        throw new Error('获取远程文件信息失败');
      }

      const contentBase64 = utf8ToBase64(JSON.stringify(data, null, 2));
      const body: any = {
        message: `Auto sync chords data: ${new Date().toLocaleString()}`,
        content: contentBase64,
        branch: githubBranch,
      };

      if (fileSha) body.sha = fileSha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      if (!putRes.ok) throw new Error('推送代码失败');

      uiStore.showToast('✅ 成功同步至 GitHub 云端', false, 'success');
    } catch (err) {
      console.error('GitHub Sync Error:', err);
      uiStore.showToast('❌ GitHub 同步失败，请检查网络或配置信息', false, 'error');
    }
  };

  const pullFromGithub = async () => {
    const githubToken = cleanHeaderString(settingsStore.githubToken);
    const githubOwner = settingsStore.githubOwner.trim();
    const githubRepo = settingsStore.githubRepo.trim();
    const githubBranch = settingsStore.githubBranch.trim();
    const githubPath = settingsStore.githubPath.trim();

    if (!githubToken || !githubOwner || !githubRepo || !githubBranch || !githubPath) {
      uiStore.showToast('❌ 拉取失败：请先在右侧栏配置完整的 GitHub 信息', false, 'error');
      return;
    }

    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}?ref=${githubBranch}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };

    try {
      uiStore.showToast('☁️ 正在从云端拉取数据...', false, 'loading');
      const res = await fetch(apiUrl, { method: 'GET', headers });

      if (!res.ok) {
        if (res.status === 404) throw new Error('云端文件不存在，请先执行一次同步上传');
        throw new Error('拉取请求失败，请检查配置或 Token 权限');
      }

      const resJson = await res.json();
      if (!resJson.content) throw new Error('云端文件内容为空');

      // GitHub API 返回的 Base64 包含换行符，解码前需将其过滤
      const cleanBase64 = resJson.content.replace(/\n/g, '');
      const decodedStr = base64ToUtf8(cleanBase64);
      const imported = JSON.parse(decodedStr);

      // 严格复用导入校验器，防止 GitHub 上被篡改的数据污染本地
      if (cleanAndValidateData(imported, 'import')) {
        chordStore.overwriteGroups(imported.groups);
        chordStore.overwriteChords(imported.chords);
        if (!chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
          chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
        }
        uiStore.showToast('✅ 已成功从 GitHub 恢复所有数据', false, 'success');
      } else {
        throw new Error('云端数据格式破损，已触发安全拦截');
      }
    } catch (err: any) {
      console.error('GitHub Pull Error:', err);
      uiStore.showToast(`❌ ${err.message || '拉取失败，请检查网络'}`, false, 'error');
    }
  };

  return { syncToGithub, pullFromGithub };
}
