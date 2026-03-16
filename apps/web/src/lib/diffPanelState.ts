import type { FileDiffMetadata } from "@pierre/diffs/react";
import type { DiffFileExpansionPreference } from "../appSettings";

export interface DiffFileStat {
  additions: number | null;
  deletions: number | null;
}

export function buildInitialExpandedFileState(
  fileKeys: ReadonlyArray<string>,
  preference: DiffFileExpansionPreference,
): Record<string, boolean> {
  const expanded = preference === "expanded";
  return Object.fromEntries(fileKeys.map((fileKey) => [fileKey, expanded]));
}

export function areAllFilesExpanded(
  expandedFileKeys: Readonly<Record<string, boolean>>,
  fileKeys: ReadonlyArray<string>,
): boolean {
  if (fileKeys.length === 0) {
    return false;
  }
  return fileKeys.every((fileKey) => expandedFileKeys[fileKey] !== false);
}

export function readFileDiffStat(fileDiff: FileDiffMetadata): DiffFileStat {
  const metadata = fileDiff as unknown as Record<string, unknown>;
  const additions = readNumericProperty(metadata, [
    "additions",
    "insertions",
    "addedLines",
    "added",
  ]);
  const deletions = readNumericProperty(metadata, [
    "deletions",
    "deletedLines",
    "removedLines",
    "removals",
    "removed",
  ]);

  return { additions, deletions };
}

function readNumericProperty(
  input: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): number | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return null;
}
