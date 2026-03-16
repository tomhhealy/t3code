import { describe, expect, it } from "vitest";
import {
  areAllFilesExpanded,
  buildInitialExpandedFileState,
  readFileDiffStat,
} from "./diffPanelState";

describe("buildInitialExpandedFileState", () => {
  it("expands every file when the preference is expanded", () => {
    expect(buildInitialExpandedFileState(["a", "b"], "expanded")).toEqual({
      a: true,
      b: true,
    });
  });

  it("collapses every file when the preference is collapsed", () => {
    expect(buildInitialExpandedFileState(["a", "b"], "collapsed")).toEqual({
      a: false,
      b: false,
    });
  });
});

describe("areAllFilesExpanded", () => {
  it("returns true only when every file is expanded", () => {
    expect(areAllFilesExpanded({ a: true, b: true }, ["a", "b"])).toBe(true);
    expect(areAllFilesExpanded({ a: true, b: false }, ["a", "b"])).toBe(false);
  });

  it("returns false when there are no files", () => {
    expect(areAllFilesExpanded({}, [])).toBe(false);
  });
});

describe("readFileDiffStat", () => {
  it("sums additions and deletions from diff hunks", () => {
    expect(
      readFileDiffStat({
        hunks: [
          { additionLines: 3, deletionLines: 1 },
          { additionLines: 1, deletionLines: 4 },
        ],
      } as never),
    ).toEqual({
      additions: 4,
      deletions: 5,
    });
  });

  it("reads additions and deletions from direct diff metadata fields", () => {
    expect(readFileDiffStat({ additions: 3, deletions: 1 } as never)).toEqual({
      additions: 3,
      deletions: 1,
    });
  });

  it("falls back to alternate metadata field names", () => {
    expect(readFileDiffStat({ addedLines: 4, removedLines: 2 } as never)).toEqual({
      additions: 4,
      deletions: 2,
    });
  });

  it("returns null stats when the metadata does not expose them", () => {
    expect(readFileDiffStat({} as never)).toEqual({
      additions: null,
      deletions: null,
    });
  });
});
