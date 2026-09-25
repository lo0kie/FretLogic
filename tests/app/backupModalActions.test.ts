// @vitest-environment jsdom
/**
 * 备份导入/导出弹窗的确认动作（backupModalActions）。
 *
 * 这个模块此前零测试引用，而它承载的是「用户点确认之后到底写入了什么」——包括凭据解密门禁与
 * 勾选快照。判错的表现都是静默的：要么把加密凭据原样写进本地（看起来导入成功、实际同步配置全是
 * 密文），要么在解密 await 窗口里读到一个与门禁判定不同版本的勾选。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleImportConfirm, parseBackupFileAndOpen } from '@/app/modals/backupModalActions';

import type { ImportExportPayload } from '@/app/types';

const { ioServiceMock, modalDataMock, closeMock, openImportWithPayloadMock, uiStoreMock } = vi.hoisted(() => ({
  ioServiceMock: {
    parseBackupFile: vi.fn(),
    triggerFullExport: vi.fn(),
    revealEncryptedSyncSettings: vi.fn(),
    applyImportSelection: vi.fn(),
  },
  modalDataMock: {
    exportBusy: false,
    importBusy: false,
    exportSelection: { chords: true, songs: true, preferences: true, syncSettings: false },
    exportPassphrase: '',
    importSelection: { chords: true, songs: true, preferences: false, syncSettings: false },
    importPassphrase: '',
    parsedPayload: null as ImportExportPayload | null,
    secretDecryptFailed: false,
  },
  closeMock: vi.fn(),
  openImportWithPayloadMock: vi.fn(),
  uiStoreMock: { message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
}));

vi.mock('@/app/services/backup/useImportExportService', () => ({ useImportExportService: () => ioServiceMock }));
vi.mock('@/app/modals/useBackupModals', () => ({
  modalData: modalDataMock,
  close: closeMock,
  openImportWithPayload: openImportWithPayloadMock,
}));
vi.mock('@/platform/store/uiStore', () => ({ useUiStore: () => uiStoreMock }));

const baseSelection = { chords: true, songs: true, preferences: false, syncSettings: false };

const payload = (extra: Partial<ImportExportPayload> = {}): ImportExportPayload =>
  ({ version: 7, groups: [], chords: [], songs: [], ...extra }) as ImportExportPayload;

/** 每个用例都从「一个干净的导入弹窗」起步，避免上一条用例的勾选/密码残留 */
const resetModal = (overrides: Partial<typeof modalDataMock> = {}) => {
  Object.assign(modalDataMock, {
    importSelection: { ...baseSelection },
    importPassphrase: '',
    parsedPayload: null,
    secretDecryptFailed: false,
    importBusy: false,
    ...overrides,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  resetModal();
});

describe('parseBackupFileAndOpen', () => {
  it('解析成功后把载荷交给导入面板，失败时静默返回（文案已由解析层给出）', async () => {
    const parsed = payload();
    ioServiceMock.parseBackupFile.mockResolvedValue(parsed);

    await parseBackupFileAndOpen(new File(['{}'], 'backup.json'));
    expect(openImportWithPayloadMock).toHaveBeenCalledWith(parsed, 'backup.json');

    openImportWithPayloadMock.mockClear();
    ioServiceMock.parseBackupFile.mockRejectedValue(new Error('bad file'));
    // 不得把异常抛给调用方（状态壳的 isParsing 复位在 finally 里，抛出会打断按钮态）
    await expect(parseBackupFileAndOpen(new File([''], 'x.json'))).resolves.toBeUndefined();
    expect(openImportWithPayloadMock).not.toHaveBeenCalled();
  });
});

describe('handleImportConfirm 的凭据门禁', () => {
  it('载荷未就绪时提示并关闭弹窗，不做任何应用', async () => {
    await handleImportConfirm();

    expect(uiStoreMock.message.error).toHaveBeenCalledWith('备份包未就绪，请重新选择文件');
    expect(closeMock).toHaveBeenCalledWith('import');
    expect(ioServiceMock.applyImportSelection).not.toHaveBeenCalled();
  });

  it('勾选同步配置且包内凭据已加密时，缺密码就拒绝应用并保持弹窗打开', async () => {
    resetModal({
      parsedPayload: payload({ syncSettings: { secrets: { githubToken: 'cipher' } } as never }),
      importSelection: { ...baseSelection, syncSettings: true },
      importPassphrase: '',
    });

    await handleImportConfirm();

    expect(ioServiceMock.revealEncryptedSyncSettings).not.toHaveBeenCalled();
    expect(ioServiceMock.applyImportSelection).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
    expect(modalDataMock.secretDecryptFailed).toBe(true);
    expect(uiStoreMock.message.warning).toHaveBeenCalledWith('该备份的凭据已加密，请输入导出时设置的密码');
  });

  it('解密失败时不应用、不关闭，错误文案不区分「密码错」与「包损坏」', async () => {
    resetModal({
      parsedPayload: payload({ syncSettings: { secrets: { githubToken: 'cipher' } } as never }),
      importSelection: { ...baseSelection, syncSettings: true },
      importPassphrase: 'wrong',
    });
    ioServiceMock.revealEncryptedSyncSettings.mockRejectedValue(new Error('boom'));

    await handleImportConfirm();

    expect(ioServiceMock.applyImportSelection).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
    expect(modalDataMock.secretDecryptFailed).toBe(true);
    expect(uiStoreMock.message.error).toHaveBeenCalledWith('凭据解密失败：导出密码错误或备份已损坏');
  });

  it('勾选在解密 await 窗口内被改动时，应用的仍是窗口开始时的快照', async () => {
    // 门禁判定与 applyImportSelection 若各自现读 modalData.importSelection，两者会落在不同版本的
    // 勾选上：窗口内新勾上「同步配置」就会带着 syncSettings 写入、却跳过了上面的解密校验。
    resetModal({
      parsedPayload: payload({ syncSettings: { secrets: { githubToken: 'cipher' } } as never }),
      importSelection: { ...baseSelection, syncSettings: true },
      importPassphrase: 'pw',
    });
    ioServiceMock.revealEncryptedSyncSettings.mockImplementation(async () => {
      // 必须**原地改属性**：勾选面板绑定的就是 modalData.importSelection 这个对象的字段，
      // 若换成「替换整个对象」，无快照的实现也会因引用捕获而读到旧值，用例就失去区分力
      modalDataMock.importSelection.syncSettings = false;
    });

    await handleImportConfirm();

    expect(ioServiceMock.applyImportSelection).toHaveBeenCalledTimes(1);
    expect(ioServiceMock.applyImportSelection.mock.calls[0]?.[1]).toMatchObject({ syncSettings: true });
  });

  it('全部就绪时应用、关闭弹窗并提示成功', async () => {
    resetModal({
      parsedPayload: payload(),
      importSelection: { ...baseSelection, preferences: true },
    });

    await handleImportConfirm();

    expect(ioServiceMock.applyImportSelection).toHaveBeenCalledWith(expect.anything(), {
      ...baseSelection,
      preferences: true,
    });
    expect(closeMock).toHaveBeenCalledWith('import');
    expect(uiStoreMock.message.success).toHaveBeenCalledWith('已导入所选数据并覆盖本地');
  });
});
