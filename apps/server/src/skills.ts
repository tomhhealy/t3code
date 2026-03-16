import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  InstalledSkill,
  RegistrySkillResult,
  SkillsCheckUpdatesInput,
  SkillsCheckUpdatesResult,
  SkillsCreateInput,
  SkillsCreateResult,
  SkillsGetConfigInput,
  SkillsInstallInput,
  SkillsInstallResult,
  SkillsListInstalledInput,
  SkillsListInstalledResult,
  SkillsPathOverride,
  SkillsReadFileInput,
  SkillsReadFileResult,
  SkillsResolvedConfig,
  SkillsSearchRegistryInput,
  SkillsSearchRegistryResult,
  SkillsUpdateInput,
  SkillsUpdateResult,
  SkillsWriteFileInput,
  SkillsWriteFileResult,
} from "@t3tools/contracts";
import { runProcess } from "./processRunner";
import { isCommandAvailable } from "./open";

const DEFAULT_SKILLS_CLI_COMMAND = "npx";
const DEFAULT_SKILLS_CLI_ARGS = ["--yes", "skills"] as const;
const DEFAULT_REGISTRIES: SkillsResolvedConfig["registryDefaults"] = [
  { id: "default", label: "Skills registry" },
];

export class SkillsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillsError";
  }
}

interface ResolvedPaths {
  codexHomePath: string;
  codexHomeSource: SkillsResolvedConfig["codexHomeSource"];
  skillsDirPath: string;
}

interface SkillsCliOptions {
  env: NodeJS.ProcessEnv;
  cwd?: string;
}

interface SkillsCliJsonShape {
  results?: unknown[];
  skills?: unknown[];
  updates?: unknown[];
}

interface SkillsProcessAdapter {
  runJson(args: readonly string[], options: SkillsCliOptions): Promise<SkillsCliJsonShape>;
  isAvailable(): boolean;
  commandLabel(): string;
}

function makeSkillsProcessAdapter(): SkillsProcessAdapter {
  return {
    async runJson(args, options) {
      const result = await runProcess(
        DEFAULT_SKILLS_CLI_COMMAND,
        [...DEFAULT_SKILLS_CLI_ARGS, ...args],
        {
          env: options.env,
          cwd: options.cwd,
          timeoutMs: 30_000,
        },
      );
      const stdout = result.stdout.trim();
      if (!stdout) {
        return {};
      }
      try {
        return JSON.parse(stdout) as SkillsCliJsonShape;
      } catch {
        throw new SkillsError("Skills CLI returned invalid JSON output.");
      }
    },
    isAvailable() {
      return isCommandAvailable(DEFAULT_SKILLS_CLI_COMMAND);
    },
    commandLabel() {
      return `${DEFAULT_SKILLS_CLI_COMMAND} ${DEFAULT_SKILLS_CLI_ARGS.join(" ")}`;
    },
  };
}

function toNullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimLineValue(line: string): string | null {
  const trimmed = line.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSkillMetadata(markdown: string): {
  name: string | null;
  description: string | null;
  malformed: boolean;
} {
  const lines = markdown.split(/\r?\n/);
  let name: string | null = null;
  let description: string | null = null;

  for (const line of lines) {
    if (name === null && line.startsWith("# ")) {
      name = trimLineValue(line.slice(2));
      continue;
    }
    if (description === null) {
      const candidate = trimLineValue(line);
      if (candidate && !candidate.startsWith("---")) {
        description = candidate;
        break;
      }
    }
  }

  return {
    name,
    description,
    malformed: name === null,
  };
}

function slugifySkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildSkillMarkdown(input: { name: string; description: string; initialBody?: string }) {
  const description = input.description.trim();
  const body = input.initialBody?.trim();
  return [
    `# ${input.name.trim()}`,
    "",
    description || "Add a short description for this skill.",
    "",
    body || "Describe when to use this skill and the workflow it should follow.",
    "",
  ].join("\n");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveEffectiveCodexHome(pathOverride: SkillsPathOverride): Promise<ResolvedPaths> {
  const override = typeof pathOverride === "string" ? pathOverride.trim() : "";
  const homeDir = os.homedir();
  const codexHomeCandidate = path.join(homeDir, ".codex");
  const agentsHomeCandidate = path.join(homeDir, ".agents");

  let codexHomePath: string;
  if (override) {
    codexHomePath = path.resolve(override);
  } else if (process.env.CODEX_HOME?.trim()) {
    codexHomePath = path.resolve(process.env.CODEX_HOME.trim());
  } else if (await pathExists(path.join(codexHomeCandidate, "skills"))) {
    codexHomePath = codexHomeCandidate;
  } else if (await pathExists(path.join(agentsHomeCandidate, "skills"))) {
    codexHomePath = agentsHomeCandidate;
  } else {
    codexHomePath = agentsHomeCandidate;
  }
  const codexHomeSource = override ? "app-setting" : "server-default";
  return {
    codexHomePath,
    codexHomeSource,
    skillsDirPath: path.join(codexHomePath, "skills"),
  };
}

async function resolveConfig(pathOverride: SkillsPathOverride): Promise<SkillsResolvedConfig> {
  const resolved = await resolveEffectiveCodexHome(pathOverride);
  const cli = makeSkillsProcessAdapter();
  let writable = false;
  try {
    await fs.mkdir(resolved.skillsDirPath, { recursive: true });
    await fs.access(resolved.skillsDirPath, fsConstants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return {
    codexHomePath: resolved.codexHomePath,
    codexHomeSource: resolved.codexHomeSource,
    skillsDirPath: resolved.skillsDirPath,
    skillsCliAvailable: cli.isAvailable(),
    skillsCliCommand: cli.commandLabel(),
    registryDefaults: DEFAULT_REGISTRIES,
    writable,
  };
}

async function assertSkillsDirectory(resolved: ResolvedPaths): Promise<void> {
  try {
    await fs.mkdir(resolved.skillsDirPath, { recursive: true });
    await fs.access(resolved.skillsDirPath, fsConstants.R_OK);
  } catch {
    throw new SkillsError(`Skills directory is unavailable: ${resolved.skillsDirPath}`);
  }
}

function resolveSkillFilePath(input: {
  skillsDirPath: string;
  skillDirName: string;
  relativePath: string;
}): { absolutePath: string; relativePath: string } {
  const trimmedRelativePath = input.relativePath.trim();
  if (path.isAbsolute(trimmedRelativePath)) {
    throw new SkillsError("Skill file path must be relative.");
  }
  const skillRoot = path.resolve(input.skillsDirPath, input.skillDirName);
  const absolutePath = path.resolve(skillRoot, trimmedRelativePath);
  const relativeToSkill = path.relative(skillRoot, absolutePath);
  if (
    relativeToSkill.length === 0 ||
    relativeToSkill === "." ||
    relativeToSkill.startsWith("..") ||
    path.isAbsolute(relativeToSkill)
  ) {
    throw new SkillsError("Skill file path must stay within the skill directory.");
  }
  return { absolutePath, relativePath: relativeToSkill.replaceAll("\\", "/") };
}

async function readInstalledSkill(
  skillsDirPath: string,
  directoryName: string,
): Promise<InstalledSkill> {
  const absolutePath = path.join(skillsDirPath, directoryName);
  const skillMarkdownPath = path.join(absolutePath, "SKILL.md");
  let markdown = "";
  try {
    markdown = await fs.readFile(skillMarkdownPath, "utf8");
  } catch {
    markdown = "";
  }

  const parsed = parseSkillMetadata(markdown);
  return {
    id: directoryName,
    name: parsed.name ?? directoryName,
    description: parsed.description,
    directoryName,
    absolutePath,
    skillMarkdownPath,
    source: directoryName.startsWith(".") ? "system" : "local",
    version: null,
    updateStatus: "unknown",
    remoteRef: null,
    hasMalformedMetadata: parsed.malformed,
  };
}

function normalizeRegistrySearchResult(
  item: Record<string, unknown>,
  installedSkillIds: ReadonlySet<string>,
): RegistrySkillResult | null {
  const installTarget = toNullIfEmpty(String(item.installTarget ?? item.target ?? item.id ?? ""));
  if (!installTarget) return null;
  const id = toNullIfEmpty(String(item.id ?? installTarget));
  if (!id) return null;
  return {
    id,
    name: toNullIfEmpty(String(item.name ?? id)) ?? id,
    description: toNullIfEmpty(typeof item.description === "string" ? item.description : null),
    installTarget,
    sourceLabel:
      toNullIfEmpty(String(item.sourceLabel ?? item.source ?? "Skills registry")) ??
      "Skills registry",
    url: toNullIfEmpty(typeof item.url === "string" ? item.url : null),
    installed: installedSkillIds.has(id) || installedSkillIds.has(path.basename(installTarget)),
  };
}

function normalizeUpdateEntry(item: Record<string, unknown>) {
  const skillId = toNullIfEmpty(String(item.skillId ?? item.id ?? item.name ?? ""));
  if (!skillId) return null;
  const hasUpdate = Boolean(item.updateAvailable ?? item.hasUpdate ?? false);
  const updateStatus: SkillsCheckUpdatesResult["updates"][number]["updateStatus"] = hasUpdate
    ? "update-available"
    : "up-to-date";
  return {
    skillId,
    updateStatus,
    version: toNullIfEmpty(typeof item.version === "string" ? item.version : null),
    remoteRef: toNullIfEmpty(typeof item.remoteRef === "string" ? item.remoteRef : null),
  };
}

async function runSkillsCliJson(
  args: readonly string[],
  resolved: ResolvedPaths,
  adapter: SkillsProcessAdapter = makeSkillsProcessAdapter(),
): Promise<SkillsCliJsonShape> {
  if (!adapter.isAvailable()) {
    throw new SkillsError(
      `Skills CLI is unavailable. Install and retry: ${adapter.commandLabel()}`,
    );
  }
  return adapter.runJson(args, {
    cwd: resolved.skillsDirPath,
    env: {
      ...process.env,
      CODEX_HOME: resolved.codexHomePath,
    },
  });
}

export async function getSkillsConfig(input: SkillsGetConfigInput): Promise<SkillsResolvedConfig> {
  return resolveConfig(input.codexHomePathOverride);
}

export async function listInstalledSkills(
  input: SkillsListInstalledInput,
): Promise<SkillsListInstalledResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const entries = await fs.readdir(resolved.skillsDirPath, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readInstalledSkill(resolved.skillsDirPath, entry.name)),
  );
  return {
    skills: skills.toSorted((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function searchRegistrySkills(
  input: SkillsSearchRegistryInput,
): Promise<SkillsSearchRegistryResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const trimmedQuery = input.query.trim();
  if (trimmedQuery.length === 0) {
    return { results: [] };
  }
  const installed = await listInstalledSkills({
    codexHomePathOverride: input.codexHomePathOverride,
  });
  const installedSkillIds = new Set(
    installed.skills.flatMap((skill) => [skill.id, skill.directoryName]),
  );
  const args = ["find", trimmedQuery, "--json"];
  const json = await runSkillsCliJson(args, resolved);
  const results = (json.results ?? [])
    .map((item) =>
      typeof item === "object" && item !== null
        ? normalizeRegistrySearchResult(item as Record<string, unknown>, installedSkillIds)
        : null,
    )
    .filter((item): item is RegistrySkillResult => item !== null);
  return { results };
}

export async function installSkill(input: SkillsInstallInput): Promise<SkillsInstallResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  await runSkillsCliJson(["add", input.installTarget, "-g", "-y", "--json"], resolved);
  return {
    installedSkillId: path.basename(input.installTarget),
  };
}

export async function checkSkillUpdates(
  input: SkillsCheckUpdatesInput,
): Promise<SkillsCheckUpdatesResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const json = await runSkillsCliJson(["check", "--json"], resolved);
  return {
    updates: (json.updates ?? []).reduce<Array<SkillsCheckUpdatesResult["updates"][number]>>(
      (updates, item) => {
        if (typeof item !== "object" || item === null) {
          return updates;
        }
        const normalized = normalizeUpdateEntry(item as Record<string, unknown>);
        if (normalized) {
          updates.push(normalized);
        }
        return updates;
      },
      [],
    ),
  };
}

export async function updateSkills(input: SkillsUpdateInput): Promise<SkillsUpdateResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const args = input.skillId
    ? ["update", input.skillId, "-y", "--json"]
    : ["update", "-y", "--json"];
  const json = await runSkillsCliJson(args, resolved);
  const updatedSkillIds = (json.updates ?? [])
    .map((item) =>
      typeof item === "object" && item !== null
        ? (normalizeUpdateEntry(item as Record<string, unknown>)?.skillId ?? null)
        : null,
    )
    .filter((item): item is string => item !== null);
  return { updatedSkillIds };
}

export async function createSkill(input: SkillsCreateInput): Promise<SkillsCreateResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const directoryName = slugifySkillName(input.name);
  if (!directoryName) {
    throw new SkillsError("Skill name could not be converted into a valid directory name.");
  }
  const absolutePath = path.join(resolved.skillsDirPath, directoryName);
  const skillMarkdownPath = path.join(absolutePath, "SKILL.md");
  try {
    await fs.mkdir(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new SkillsError(`A skill already exists at ${absolutePath}`);
    }
    throw error;
  }
  await fs.writeFile(
    skillMarkdownPath,
    buildSkillMarkdown({
      name: input.name,
      description: input.description,
      ...(input.initialBody !== undefined ? { initialBody: input.initialBody } : {}),
    }),
    "utf8",
  );
  return {
    skill: await readInstalledSkill(resolved.skillsDirPath, directoryName),
  };
}

export async function readSkillFile(input: SkillsReadFileInput): Promise<SkillsReadFileResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const resolvedFile = resolveSkillFilePath({
    skillsDirPath: resolved.skillsDirPath,
    skillDirName: input.skillDirName,
    relativePath: input.relativePath,
  });
  const contents = await fs.readFile(resolvedFile.absolutePath, "utf8").catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SkillsError(`Skill file does not exist: ${resolvedFile.relativePath}`);
    }
    throw error;
  });
  return {
    relativePath: resolvedFile.relativePath,
    absolutePath: resolvedFile.absolutePath,
    contents,
  };
}

export async function writeSkillFile(input: SkillsWriteFileInput): Promise<SkillsWriteFileResult> {
  const resolved = await resolveEffectiveCodexHome(input.codexHomePathOverride);
  await assertSkillsDirectory(resolved);
  const resolvedFile = resolveSkillFilePath({
    skillsDirPath: resolved.skillsDirPath,
    skillDirName: input.skillDirName,
    relativePath: input.relativePath,
  });
  await fs.mkdir(path.dirname(resolvedFile.absolutePath), { recursive: true });
  await fs.writeFile(resolvedFile.absolutePath, input.contents, "utf8");
  return {
    relativePath: resolvedFile.relativePath,
    absolutePath: resolvedFile.absolutePath,
  };
}
