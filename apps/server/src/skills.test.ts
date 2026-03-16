import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSkill,
  getSkillsConfig,
  listInstalledSkills,
  readSkillFile,
  searchRegistrySkills,
  writeSkillFile,
} from "./skills";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("skills", () => {
  it("falls back to .agents when there is no override, no CODEX_HOME, and no existing .codex skills", async () => {
    const originalCodexHome = process.env.CODEX_HOME;
    const fakeHome = makeTempDir("t3code-skills-user-home-");
    const originalHomedir = os.homedir;

    process.env.CODEX_HOME = "";
    os.homedir = () => fakeHome;

    try {
      const config = await getSkillsConfig({ codexHomePathOverride: null });

      expect(config.codexHomePath).toBe(path.join(fakeHome, ".agents"));
      expect(config.skillsDirPath).toBe(path.join(fakeHome, ".agents", "skills"));
    } finally {
      os.homedir = originalHomedir;
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
    }
  });

  it("prefers an existing .codex skills directory over .agents when no override is set", async () => {
    const originalCodexHome = process.env.CODEX_HOME;
    const fakeHome = makeTempDir("t3code-skills-user-home-");
    const originalHomedir = os.homedir;

    fs.mkdirSync(path.join(fakeHome, ".codex", "skills"), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, ".agents", "skills"), { recursive: true });
    process.env.CODEX_HOME = "";
    os.homedir = () => fakeHome;

    try {
      const config = await getSkillsConfig({ codexHomePathOverride: null });

      expect(config.codexHomePath).toBe(path.join(fakeHome, ".codex"));
      expect(config.skillsDirPath).toBe(path.join(fakeHome, ".codex", "skills"));
    } finally {
      os.homedir = originalHomedir;
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
    }
  });

  it("resolves CODEX_HOME from the override and creates the skills directory", async () => {
    const codexHomePath = makeTempDir("t3code-skills-home-");

    const config = await getSkillsConfig({ codexHomePathOverride: codexHomePath });

    expect(config.codexHomePath).toBe(codexHomePath);
    expect(config.skillsDirPath).toBe(path.join(codexHomePath, "skills"));
    expect(fs.existsSync(config.skillsDirPath)).toBe(true);
  });

  it("creates, lists, reads, and writes a local skill", async () => {
    const codexHomePath = makeTempDir("t3code-skills-home-");

    const created = await createSkill({
      codexHomePathOverride: codexHomePath,
      name: "Demo Skill",
      description: "Helps with demos.",
    });
    expect(created.skill.directoryName).toBe("demo-skill");

    const listed = await listInstalledSkills({ codexHomePathOverride: codexHomePath });
    expect(listed.skills).toHaveLength(1);
    expect(listed.skills[0]?.name).toBe("Demo Skill");

    const initialRead = await readSkillFile({
      codexHomePathOverride: codexHomePath,
      skillDirName: "demo-skill",
      relativePath: "SKILL.md",
    });
    expect(initialRead.contents).toContain("# Demo Skill");

    await writeSkillFile({
      codexHomePathOverride: codexHomePath,
      skillDirName: "demo-skill",
      relativePath: "SKILL.md",
      contents: "# Demo Skill\n\nUpdated description.\n",
    });

    const updatedRead = await readSkillFile({
      codexHomePathOverride: codexHomePath,
      skillDirName: "demo-skill",
      relativePath: "SKILL.md",
    });
    expect(updatedRead.contents).toContain("Updated description.");
  });

  it("rejects path traversal when reading and writing skill files", async () => {
    const codexHomePath = makeTempDir("t3code-skills-home-");
    await createSkill({
      codexHomePathOverride: codexHomePath,
      name: "Traversal Skill",
      description: "Blocks path traversal.",
    });

    await expect(
      readSkillFile({
        codexHomePathOverride: codexHomePath,
        skillDirName: "traversal-skill",
        relativePath: "../outside.md",
      }),
    ).rejects.toThrow("must stay within the skill directory");

    await expect(
      writeSkillFile({
        codexHomePathOverride: codexHomePath,
        skillDirName: "traversal-skill",
        relativePath: "../outside.md",
        contents: "bad",
      }),
    ).rejects.toThrow("must stay within the skill directory");
  });

  it("fails registry search cleanly when the Skills CLI is unavailable", async () => {
    const codexHomePath = makeTempDir("t3code-skills-home-");
    const originalPath = process.env.PATH;
    process.env.PATH = "";

    try {
      await expect(
        searchRegistrySkills({
          codexHomePathOverride: codexHomePath,
          query: "react",
        }),
      ).rejects.toThrow("Skills CLI is unavailable");
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
