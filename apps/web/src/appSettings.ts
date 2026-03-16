import { useCallback } from "react";
import { Option, Schema } from "effect";
import { EditorId, type ProviderKind } from "@t3tools/contracts";
import { getDefaultModel, getModelOptions, normalizeModelSlug } from "@t3tools/shared/model";
import {
  DEFAULT_FEATURE_BRANCH_PREFIX,
  DEFAULT_WORKTREE_BRANCH_PREFIX,
  DEFAULT_WORKTREE_ROOT_NAME,
} from "@t3tools/shared/git";
import { getLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";

export const APP_SETTINGS_STORAGE_KEY = "t3code:app-settings:v1";
const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;
export const TIMESTAMP_FORMAT_OPTIONS = ["locale", "12-hour", "24-hour"] as const;
export type TimestampFormat = (typeof TIMESTAMP_FORMAT_OPTIONS)[number];
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
export const DIFF_FILE_EXPANSION_OPTIONS = ["expanded", "collapsed"] as const;
export type DiffFileExpansionPreference = (typeof DIFF_FILE_EXPANSION_OPTIONS)[number];
export const DEFAULT_DIFF_FILE_EXPANSION: DiffFileExpansionPreference = "expanded";
const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  codex: new Set(getModelOptions("codex").map((option) => option.slug)),
};

export const AppSettingsSchema = Schema.Struct({
  codexBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  codexHomePath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  defaultThreadEnvMode: Schema.Literals(["local", "worktree"]).pipe(
    Schema.withConstructorDefault(() => Option.some("local")),
  ),
  defaultOpenDestination: Schema.NullOr(EditorId).pipe(
    Schema.withConstructorDefault(() => Option.some(null)),
  ),
  confirmThreadDelete: Schema.Boolean.pipe(Schema.withConstructorDefault(() => Option.some(true))),
  enableAssistantStreaming: Schema.Boolean.pipe(
    Schema.withConstructorDefault(() => Option.some(false)),
  ),
  timestampFormat: Schema.Literals(["locale", "12-hour", "24-hour"]).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_TIMESTAMP_FORMAT)),
  ),
  defaultDiffFileExpansion: Schema.Literals(["expanded", "collapsed"]).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_DIFF_FILE_EXPANSION)),
  ),
  customCodexModels: Schema.Array(Schema.String).pipe(
    Schema.withConstructorDefault(() => Option.some([])),
  ),
  worktreeBranchPrefix: Schema.String.check(Schema.isMaxLength(128)).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_WORKTREE_BRANCH_PREFIX)),
  ),
  featureBranchPrefix: Schema.String.check(Schema.isMaxLength(128)).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_FEATURE_BRANCH_PREFIX)),
  ),
  worktreeRootName: Schema.String.check(Schema.isMaxLength(128)).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_WORKTREE_ROOT_NAME)),
  ),
});
export type AppSettings = typeof AppSettingsSchema.Type;
export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

export interface EffectiveGitNamingSettings {
  worktreeBranchPrefix: string;
  featureBranchPrefix: string;
  worktreeRootName: string;
}

export const DEFAULT_APP_SETTINGS = AppSettingsSchema.makeUnsafe({});

export function resolveEffectiveGitNamingSettings(input: {
  globalSettings: AppSettings;
  projectGitNaming?: {
    worktreeBranchPrefix: string | null;
    featureBranchPrefix: string | null;
    worktreeRootName: string | null;
  } | null;
}): EffectiveGitNamingSettings {
  return {
    worktreeBranchPrefix:
      input.projectGitNaming?.worktreeBranchPrefix?.trim() ||
      input.globalSettings.worktreeBranchPrefix,
    featureBranchPrefix:
      input.projectGitNaming?.featureBranchPrefix?.trim() ||
      input.globalSettings.featureBranchPrefix,
    worktreeRootName:
      input.projectGitNaming?.worktreeRootName?.trim() || input.globalSettings.worktreeRootName,
  };
}

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind = "codex",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();
  const builtInModelSlugs = BUILT_IN_MODEL_SLUGS_BY_PROVIDER[provider];

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getModelOptions(provider).map(({ slug, name }) => ({
    slug,
    name,
    isCustom: false,
  }));
  const seen = new Set(options.map((option) => option.slug));

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      slug,
      name: slug,
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (normalizedSelectedModel && !seen.has(normalizedSelectedModel)) {
    options.push({
      slug: normalizedSelectedModel,
      name: normalizedSelectedModel,
      isCustom: true,
    });
  }

  return options;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel: string | null | undefined,
): string {
  const options = getAppModelOptions(provider, customModels, selectedModel);
  const trimmedSelectedModel = selectedModel?.trim();
  if (trimmedSelectedModel) {
    const direct = options.find((option) => option.slug === trimmedSelectedModel);
    if (direct) {
      return direct.slug;
    }

    const byName = options.find(
      (option) => option.name.toLowerCase() === trimmedSelectedModel.toLowerCase(),
    );
    if (byName) {
      return byName.slug;
    }
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (!normalizedSelectedModel) {
    return getDefaultModel(provider);
  }

  return (
    options.find((option) => option.slug === normalizedSelectedModel)?.slug ??
    getDefaultModel(provider)
  );
}

export function useAppSettings() {
  const [settings, setSettings] = useLocalStorage(
    APP_SETTINGS_STORAGE_KEY,
    DEFAULT_APP_SETTINGS,
    AppSettingsSchema,
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => ({
        ...prev,
        ...patch,
      }));
    },
    [setSettings],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
  }, [setSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    defaults: DEFAULT_APP_SETTINGS,
  } as const;
}

export function getStoredAppSettings(): AppSettings {
  return getLocalStorageItem(APP_SETTINGS_STORAGE_KEY, AppSettingsSchema) ?? DEFAULT_APP_SETTINGS;
}
