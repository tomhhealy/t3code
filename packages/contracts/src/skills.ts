import { Schema } from "effect";
import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas";

const OPTIONAL_PATH_INPUT_MAX_LENGTH = 4096;
const SKILL_FILE_PATH_MAX_LENGTH = 512;
const SKILL_QUERY_MAX_LENGTH = 256;

export const SkillsPathOverride = Schema.NullOr(
  Schema.String.check(Schema.isMaxLength(OPTIONAL_PATH_INPUT_MAX_LENGTH)),
);
export type SkillsPathOverride = typeof SkillsPathOverride.Type;

export const SkillsRegistryInfo = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
});
export type SkillsRegistryInfo = typeof SkillsRegistryInfo.Type;

export const SkillsResolvedConfig = Schema.Struct({
  codexHomePath: TrimmedNonEmptyString,
  skillsDirPath: TrimmedNonEmptyString,
  codexHomeSource: Schema.Literals(["app-setting", "server-default"]),
  skillsCliAvailable: Schema.Boolean,
  skillsCliCommand: TrimmedNonEmptyString,
  registryDefaults: Schema.Array(SkillsRegistryInfo),
  writable: Schema.Boolean,
});
export type SkillsResolvedConfig = typeof SkillsResolvedConfig.Type;

export const InstalledSkill = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.NullOr(TrimmedNonEmptyString),
  directoryName: TrimmedNonEmptyString,
  absolutePath: TrimmedNonEmptyString,
  skillMarkdownPath: TrimmedNonEmptyString,
  source: Schema.Literals(["local", "registry", "system", "unknown"]),
  version: Schema.NullOr(TrimmedNonEmptyString),
  updateStatus: Schema.Literals(["unknown", "up-to-date", "update-available"]),
  remoteRef: Schema.NullOr(TrimmedNonEmptyString),
  hasMalformedMetadata: Schema.Boolean,
});
export type InstalledSkill = typeof InstalledSkill.Type;

export const SkillsListInstalledInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
});
export type SkillsListInstalledInput = typeof SkillsListInstalledInput.Type;

export const SkillsListInstalledResult = Schema.Struct({
  skills: Schema.Array(InstalledSkill),
});
export type SkillsListInstalledResult = typeof SkillsListInstalledResult.Type;

export const RegistrySkillResult = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.NullOr(TrimmedNonEmptyString),
  installTarget: TrimmedNonEmptyString,
  sourceLabel: TrimmedNonEmptyString,
  url: Schema.NullOr(TrimmedNonEmptyString),
  installed: Schema.Boolean,
});
export type RegistrySkillResult = typeof RegistrySkillResult.Type;

export const SkillsSearchRegistryInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  query: TrimmedString.check(Schema.isMaxLength(SKILL_QUERY_MAX_LENGTH)),
});
export type SkillsSearchRegistryInput = typeof SkillsSearchRegistryInput.Type;

export const SkillsSearchRegistryResult = Schema.Struct({
  results: Schema.Array(RegistrySkillResult),
});
export type SkillsSearchRegistryResult = typeof SkillsSearchRegistryResult.Type;

export const SkillsInstallInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  installTarget: TrimmedNonEmptyString,
});
export type SkillsInstallInput = typeof SkillsInstallInput.Type;

export const SkillsInstallResult = Schema.Struct({
  installedSkillId: TrimmedNonEmptyString,
});
export type SkillsInstallResult = typeof SkillsInstallResult.Type;

export const SkillsCheckUpdatesInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
});
export type SkillsCheckUpdatesInput = typeof SkillsCheckUpdatesInput.Type;

export const SkillsCheckUpdatesResult = Schema.Struct({
  updates: Schema.Array(
    Schema.Struct({
      skillId: TrimmedNonEmptyString,
      updateStatus: Schema.Literals(["unknown", "up-to-date", "update-available"]),
      version: Schema.NullOr(TrimmedNonEmptyString),
      remoteRef: Schema.NullOr(TrimmedNonEmptyString),
    }),
  ),
});
export type SkillsCheckUpdatesResult = typeof SkillsCheckUpdatesResult.Type;

export const SkillsUpdateInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  skillId: Schema.NullOr(TrimmedNonEmptyString),
});
export type SkillsUpdateInput = typeof SkillsUpdateInput.Type;

export const SkillsUpdateResult = Schema.Struct({
  updatedSkillIds: Schema.Array(TrimmedNonEmptyString),
});
export type SkillsUpdateResult = typeof SkillsUpdateResult.Type;

export const SkillsCreateInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  description: TrimmedString.check(Schema.isMaxLength(280)),
  initialBody: Schema.optional(Schema.String),
});
export type SkillsCreateInput = typeof SkillsCreateInput.Type;

export const SkillsCreateResult = Schema.Struct({
  skill: InstalledSkill,
});
export type SkillsCreateResult = typeof SkillsCreateResult.Type;

export const SkillsReadFileInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  skillDirName: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(SKILL_FILE_PATH_MAX_LENGTH)),
});
export type SkillsReadFileInput = typeof SkillsReadFileInput.Type;

export const SkillsReadFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  absolutePath: TrimmedNonEmptyString,
  contents: Schema.String,
});
export type SkillsReadFileResult = typeof SkillsReadFileResult.Type;

export const SkillsWriteFileInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
  skillDirName: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(SKILL_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type SkillsWriteFileInput = typeof SkillsWriteFileInput.Type;

export const SkillsWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  absolutePath: TrimmedNonEmptyString,
});
export type SkillsWriteFileResult = typeof SkillsWriteFileResult.Type;

export const SkillsGetConfigInput = Schema.Struct({
  codexHomePathOverride: SkillsPathOverride,
});
export type SkillsGetConfigInput = typeof SkillsGetConfigInput.Type;
