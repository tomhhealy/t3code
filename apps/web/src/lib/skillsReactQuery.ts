import {
  type SkillsCheckUpdatesResult,
  type SkillsListInstalledResult,
  type SkillsResolvedConfig,
  type SkillsSearchRegistryResult,
} from "@t3tools/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

const EMPTY_CONFIG: SkillsResolvedConfig = {
  codexHomePath: "",
  codexHomeSource: "server-default",
  skillsDirPath: "",
  skillsCliAvailable: false,
  skillsCliCommand: "npx skills",
  registryDefaults: [{ id: "default", label: "Skills registry" }],
  writable: false,
};

const EMPTY_INSTALLED: SkillsListInstalledResult = { skills: [] };
const EMPTY_SEARCH: SkillsSearchRegistryResult = { results: [] };
const EMPTY_UPDATES: SkillsCheckUpdatesResult = { updates: [] };

export const skillsQueryKeys = {
  all: ["skills"] as const,
  config: (codexHomePathOverride: string | null) =>
    ["skills", "config", codexHomePathOverride] as const,
  installed: (codexHomePathOverride: string | null) =>
    ["skills", "installed", codexHomePathOverride] as const,
  search: (codexHomePathOverride: string | null, query: string) =>
    ["skills", "search", codexHomePathOverride, query] as const,
  updates: (codexHomePathOverride: string | null) =>
    ["skills", "updates", codexHomePathOverride] as const,
};

export function skillsConfigQueryOptions(codexHomePathOverride: string | null) {
  return queryOptions({
    queryKey: skillsQueryKeys.config(codexHomePathOverride),
    queryFn: async () => ensureNativeApi().skills.getConfig({ codexHomePathOverride }),
    placeholderData: EMPTY_CONFIG,
  });
}

export function skillsInstalledQueryOptions(codexHomePathOverride: string | null) {
  return queryOptions({
    queryKey: skillsQueryKeys.installed(codexHomePathOverride),
    queryFn: async () => ensureNativeApi().skills.listInstalled({ codexHomePathOverride }),
    placeholderData: (previous) => previous ?? EMPTY_INSTALLED,
  });
}

export function skillsSearchQueryOptions(input: {
  codexHomePathOverride: string | null;
  query: string;
}) {
  const trimmedQuery = input.query.trim();
  return queryOptions({
    queryKey: skillsQueryKeys.search(input.codexHomePathOverride, trimmedQuery),
    queryFn: async () =>
      ensureNativeApi().skills.searchRegistry({
        codexHomePathOverride: input.codexHomePathOverride,
        query: trimmedQuery,
      }),
    enabled: trimmedQuery.length > 0,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH,
  });
}

export function skillsUpdatesQueryOptions(codexHomePathOverride: string | null) {
  return queryOptions({
    queryKey: skillsQueryKeys.updates(codexHomePathOverride),
    queryFn: async () => ensureNativeApi().skills.checkUpdates({ codexHomePathOverride }),
    placeholderData: (previous) => previous ?? EMPTY_UPDATES,
  });
}

export function invalidateSkillsQueries(
  queryClient: QueryClient,
  codexHomePathOverride: string | null,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: skillsQueryKeys.config(codexHomePathOverride) }),
    queryClient.invalidateQueries({ queryKey: skillsQueryKeys.installed(codexHomePathOverride) }),
    queryClient.invalidateQueries({ queryKey: skillsQueryKeys.updates(codexHomePathOverride) }),
    queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all }),
  ]);
}

export function skillsInstallMutationOptions(
  queryClient: QueryClient,
  codexHomePathOverride: string | null,
) {
  return mutationOptions({
    mutationFn: async (installTarget: string) =>
      ensureNativeApi().skills.install({ codexHomePathOverride, installTarget }),
    onSuccess: async () => {
      await invalidateSkillsQueries(queryClient, codexHomePathOverride);
    },
  });
}

export function skillsUpdateMutationOptions(
  queryClient: QueryClient,
  codexHomePathOverride: string | null,
) {
  return mutationOptions({
    mutationFn: async (skillId: string | null) =>
      ensureNativeApi().skills.update({ codexHomePathOverride, skillId }),
    onSuccess: async () => {
      await invalidateSkillsQueries(queryClient, codexHomePathOverride);
    },
  });
}

export function skillsCreateMutationOptions(
  queryClient: QueryClient,
  codexHomePathOverride: string | null,
) {
  return mutationOptions({
    mutationFn: async (input: { name: string; description: string; initialBody?: string }) =>
      ensureNativeApi().skills.create({
        codexHomePathOverride,
        ...input,
      }),
    onSuccess: async () => {
      await invalidateSkillsQueries(queryClient, codexHomePathOverride);
    },
  });
}

export function skillsWriteFileMutationOptions(
  queryClient: QueryClient,
  codexHomePathOverride: string | null,
) {
  return mutationOptions({
    mutationFn: async (input: { skillDirName: string; relativePath: string; contents: string }) =>
      ensureNativeApi().skills.writeFile({
        codexHomePathOverride,
        ...input,
      }),
    onSuccess: async () => {
      await invalidateSkillsQueries(queryClient, codexHomePathOverride);
    },
  });
}
