import {
  CircleAlertIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCcwIcon,
  SparklesIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useAppSettings } from "../appSettings";
import { isElectron } from "../env";
import { openInPreferredEditor } from "../editorPreferences";
import { cn, resolveDesktopTitlebarInsetPx } from "../lib/utils";
import {
  invalidateSkillsQueries,
  skillsConfigQueryOptions,
  skillsCreateMutationOptions,
  skillsInstalledQueryOptions,
  skillsInstallMutationOptions,
  skillsSearchQueryOptions,
  skillsUpdateMutationOptions,
  skillsUpdatesQueryOptions,
  skillsWriteFileMutationOptions,
} from "../lib/skillsReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { toastManager } from "../components/ui/toast";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";

function sourceLabel(source: "local" | "registry" | "system" | "unknown") {
  switch (source) {
    case "local":
      return "Local";
    case "registry":
      return "Registry";
    case "system":
      return "System";
    default:
      return "Unknown";
  }
}

function updateLabel(status: "unknown" | "up-to-date" | "update-available") {
  switch (status) {
    case "up-to-date":
      return "Up to date";
    case "update-available":
      return "Update available";
    default:
      return "Unknown";
  }
}

function SkillsRouteView() {
  const desktopTitlebarInsetPx = resolveDesktopTitlebarInsetPx();
  const { settings } = useAppSettings();
  const queryClient = useQueryClient();
  const codexHomePathOverride = settings.codexHomePath.trim() || null;
  const [searchInput, setSearchInput] = useState("");
  const deferredSearchInput = useDeferredValue(searchInput);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [draftSkillName, setDraftSkillName] = useState("");
  const [draftSkillDescription, setDraftSkillDescription] = useState("");
  const [editingSkillDirName, setEditingSkillDirName] = useState<string | null>(null);
  const [editingContents, setEditingContents] = useState("");
  const [editingAbsolutePath, setEditingAbsolutePath] = useState<string | null>(null);

  const configQuery = useQuery(skillsConfigQueryOptions(codexHomePathOverride));
  const installedQuery = useQuery(skillsInstalledQueryOptions(codexHomePathOverride));
  const updatesQuery = useQuery(skillsUpdatesQueryOptions(codexHomePathOverride));
  const searchQuery = useQuery(
    skillsSearchQueryOptions({
      codexHomePathOverride,
      query: deferredSearchInput,
    }),
  );

  const createMutation = useMutation(
    skillsCreateMutationOptions(queryClient, codexHomePathOverride),
  );
  const installMutation = useMutation(
    skillsInstallMutationOptions(queryClient, codexHomePathOverride),
  );
  const updateMutation = useMutation(
    skillsUpdateMutationOptions(queryClient, codexHomePathOverride),
  );
  const writeMutation = useMutation(
    skillsWriteFileMutationOptions(queryClient, codexHomePathOverride),
  );

  const installedSkills = installedQuery.data?.skills ?? [];
  const updatesBySkillId = useMemo(
    () =>
      new Map(
        (updatesQuery.data?.updates ?? []).map((update) => [update.skillId, update] as const),
      ),
    [updatesQuery.data?.updates],
  );

  useEffect(() => {
    if (!editingSkillDirName) return;
    const api = ensureNativeApi();
    void api.skills
      .readFile({
        codexHomePathOverride,
        skillDirName: editingSkillDirName,
        relativePath: "SKILL.md",
      })
      .then((result) => {
        setEditingContents(result.contents);
        setEditingAbsolutePath(result.absolutePath);
      })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Unable to open skill",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
        setEditingSkillDirName(null);
      });
  }, [codexHomePathOverride, editingSkillDirName]);

  const isRegistryDisabled = !configQuery.data?.skillsCliAvailable;
  const refreshAll = async () => {
    await invalidateSkillsQueries(queryClient, codexHomePathOverride);
  };

  const handleCreateSkill = async () => {
    try {
      const result = await createMutation.mutateAsync({
        name: draftSkillName,
        description: draftSkillDescription,
      });
      setDraftSkillName("");
      setDraftSkillDescription("");
      setIsCreateDialogOpen(false);
      setEditingSkillDirName(result.skill.directoryName);
      toastManager.add({
        type: "success",
        title: "Skill created",
        description: result.skill.name,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to create skill",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  const handleInstall = async (installTarget: string) => {
    try {
      await installMutation.mutateAsync(installTarget);
      toastManager.add({
        type: "success",
        title: "Skill installed",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to install skill",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  const handleUpdate = async (skillId: string | null) => {
    try {
      await updateMutation.mutateAsync(skillId);
      toastManager.add({
        type: "success",
        title: skillId ? "Skill updated" : "Skills updated",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to update skills",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  const openInEditor = async () => {
    if (!editingAbsolutePath) return;
    try {
      await openInPreferredEditor(
        ensureNativeApi(),
        editingAbsolutePath,
        settings.defaultOpenDestination,
      );
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to open in editor",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  const saveEditedSkill = async () => {
    if (!editingSkillDirName) return;
    try {
      await writeMutation.mutateAsync({
        skillDirName: editingSkillDirName,
        relativePath: "SKILL.md",
        contents: editingContents,
      });
      toastManager.add({
        type: "success",
        title: "Skill saved",
      });
      setEditingSkillDirName(null);
      setEditingAbsolutePath(null);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Unable to save skill",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron ? (
          <div
            className={cn(
              "drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5",
            )}
            style={{
              paddingLeft: desktopTitlebarInsetPx > 0 ? `${desktopTitlebarInsetPx}px` : undefined,
            }}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Skills
            </span>
          </div>
        ) : (
          <header className="border-b border-border px-3 py-2 md:hidden">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-foreground">Skills</span>
            </div>
          </header>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="size-4 text-primary" />
                    <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Manage agent skills loaded from{" "}
                    <span className="font-mono text-foreground">
                      {configQuery.data?.skillsDirPath || "CODEX_HOME/skills"}
                    </span>
                    .
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {configQuery.data?.codexHomeSource === "app-setting"
                        ? "Using app setting"
                        : "Using server default"}
                    </Badge>
                    <Badge variant="outline">
                      CLI {configQuery.data?.skillsCliAvailable ? "available" : "unavailable"}
                    </Badge>
                    <Badge variant="outline">
                      {configQuery.data?.writable ? "Writable" : "Read-only / unavailable"}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshAll()}
                    disabled={
                      configQuery.isFetching || installedQuery.isFetching || updatesQuery.isFetching
                    }
                  >
                    <RefreshCcwIcon className="size-3.5" />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                    <PlusIcon className="size-3.5" />
                    New skill
                  </Button>
                </div>
              </div>
              {!configQuery.data?.writable ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-sm text-amber-200">
                  <div className="flex items-start gap-2">
                    <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    <div>
                      The resolved skills directory is unavailable or not writable. Update the
                      skills home in Settings or fix filesystem permissions before creating or
                      editing local skills. When no custom path is set, T3 Code now falls back to
                      the default agent home and can use `.agents/skills`.
                    </div>
                  </div>
                </div>
              ) : null}
              {!configQuery.data?.skillsCliAvailable ? (
                <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                  Registry search, install, and update actions require{" "}
                  <span className="font-mono text-foreground">
                    {configQuery.data?.skillsCliCommand ?? "npx skills"}
                  </span>
                  .
                </div>
              ) : null}
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search skills"
                  className="md:max-w-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRegistryDisabled || updateMutation.isPending}
                  onClick={() => void handleUpdate(null)}
                >
                  {updateMutation.isPending ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCcwIcon className="size-3.5" />
                  )}
                  Update all
                </Button>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold tracking-wide text-foreground">Installed</h2>
                  <Badge variant="outline">{installedSkills.length}</Badge>
                </div>
                {installedQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Loading installed skills...
                  </div>
                ) : installedSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skills installed yet.</p>
                ) : (
                  <div className="space-y-3">
                    {installedSkills.map((skill) => {
                      const update = updatesBySkillId.get(skill.id);
                      const effectiveUpdateStatus = update?.updateStatus ?? skill.updateStatus;
                      return (
                        <article
                          key={skill.id}
                          className="rounded-xl border border-border bg-background/70 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                                <Badge variant="outline">{sourceLabel(skill.source)}</Badge>
                                <Badge variant="outline">
                                  {updateLabel(effectiveUpdateStatus)}
                                </Badge>
                                {skill.hasMalformedMetadata ? (
                                  <Badge variant="outline">Metadata partial</Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {skill.description || "No description provided."}
                              </p>
                              <p className="font-mono text-[11px] text-muted-foreground/75">
                                {skill.skillMarkdownPath}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!configQuery.data?.writable}
                                onClick={() => {
                                  setEditingSkillDirName(skill.directoryName);
                                  setEditingContents("");
                                  setEditingAbsolutePath(skill.skillMarkdownPath);
                                }}
                              >
                                <PencilIcon className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  isRegistryDisabled ||
                                  updateMutation.isPending ||
                                  effectiveUpdateStatus !== "update-available"
                                }
                                onClick={() => void handleUpdate(skill.id)}
                              >
                                Update
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold tracking-wide text-foreground">
                    Registry search
                  </h2>
                  <Badge variant="outline">{searchQuery.data?.results.length ?? 0}</Badge>
                </div>
                {isRegistryDisabled ? (
                  <p className="text-sm text-muted-foreground">
                    Install the Skills CLI to search and install registry skills.
                  </p>
                ) : deferredSearchInput.trim().length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Enter a search query to look up registry skills.
                  </p>
                ) : searchQuery.isLoading || searchQuery.isFetching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Loading registry results...
                  </div>
                ) : (searchQuery.data?.results.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No registry skills matched this query.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {searchQuery.data?.results.map((skill) => (
                      <article
                        key={skill.id}
                        className="rounded-xl border border-border bg-background/70 p-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                              <p className="text-xs text-muted-foreground">
                                {skill.description || "No description provided."}
                              </p>
                            </div>
                            <Button
                              variant={skill.installed ? "outline" : "default"}
                              size="sm"
                              disabled={installMutation.isPending || skill.installed}
                              onClick={() => void handleInstall(skill.installTarget)}
                            >
                              {skill.installed ? "Installed" : "Install"}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="outline">{skill.sourceLabel}</Badge>
                            <span className="font-mono">{skill.installTarget}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New skill</DialogTitle>
            <DialogDescription>Create a local skill in the active CODEX_HOME.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="skill-name">
                Name
              </label>
              <Input
                id="skill-name"
                value={draftSkillName}
                onChange={(event) => setDraftSkillName(event.target.value)}
                placeholder="My new skill"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="skill-description">
                Description
              </label>
              <Textarea
                id="skill-description"
                value={draftSkillDescription}
                onChange={(event) => setDraftSkillDescription(event.target.value)}
                rows={4}
                placeholder="What this skill is for and when to use it."
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateSkill()}
              disabled={
                createMutation.isPending ||
                !configQuery.data?.writable ||
                draftSkillName.trim().length === 0
              }
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={editingSkillDirName !== null}
        onOpenChange={(open) => !open && setEditingSkillDirName(null)}
      >
        <DialogPopup className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit skill</DialogTitle>
            <DialogDescription>{editingAbsolutePath ?? "SKILL.md"}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <Textarea
              value={editingContents}
              onChange={(event) => setEditingContents(event.target.value)}
              rows={18}
              className="font-mono text-xs"
            />
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void openInEditor()}
              disabled={!editingAbsolutePath}
            >
              Open in editor
            </Button>
            <Button variant="outline" onClick={() => setEditingSkillDirName(null)}>
              Close
            </Button>
            <Button
              onClick={() => void saveEditedSkill()}
              disabled={writeMutation.isPending || !configQuery.data?.writable}
            >
              {writeMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/skills")({
  component: SkillsRouteView,
});
