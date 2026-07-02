import { TuningEnum } from '@/utils/musicTheory';
import { z } from 'zod';

export const GuitarStringSchema = z.object({
  fret: z.number().int(),
  preferFlat: z.boolean(),
  isRoot: z.boolean(),
});

export const GuitarStringsModelSchema = z.tuple([
  GuitarStringSchema,
  GuitarStringSchema,
  GuitarStringSchema,
  GuitarStringSchema,
  GuitarStringSchema,
  GuitarStringSchema,
]);

export const ChordSchema = z.object({
  id: z.string(),
  chordName: z.string(),
  strings: GuitarStringsModelSchema,
  fretCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  capo: z.number().int().min(0).max(12),
  groupId: z.string(),
  tuning: z.nativeEnum(TuningEnum),
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  collapsed: z.boolean().default(false),
});

export const ImportExportPayloadSchema = z.object({
  groups: z.array(GroupSchema),
  chords: z.array(ChordSchema),
});

export const SettingsSchema = z.object({
  githubToken: z
    .string()
    .trim()
    .regex(/^ghp_[a-zA-Z0-9]{36}$|^github_pat_[a-zA-Z0-9_]{82}$/, {
      message: 'GitHub Token 格式不合法',
    }),
  githubOwner: z.string().trim().min(1, { message: '账户名称不能为空' }),
  githubRepo: z.string().trim().min(1, { message: '仓库名称不能为空' }),
  githubBranch: z.string().trim().default('master'),
  githubPath: z.string().trim().min(1, { message: '备份路径不能为空' }),
});

export type GuitarStringEntity = z.infer<typeof GuitarStringSchema>;
export type GuitarStringsModel = z.infer<typeof GuitarStringsModelSchema>;
export type Chord = z.infer<typeof ChordSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type ImportExportPayload = z.infer<typeof ImportExportPayloadSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type FretCount = Chord['fretCount'];
