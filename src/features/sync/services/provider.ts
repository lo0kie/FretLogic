import type { ImportExportPayload } from '@/types';

export interface SyncConfig {
  token?: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface SyncProvider {
  pull(): Promise<ImportExportPayload>;
  push(payload: ImportExportPayload): Promise<{ sha: string }>;
  exists(): Promise<boolean>;
}

export const SYNC_ERRORS = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_CLOUD_DATA: 'INVALID_CLOUD_DATA',
  REQUEST_FAILED: 'REQUEST_FAILED',
} as const;
