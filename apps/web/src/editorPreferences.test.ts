import { beforeEach, describe, expect, it } from "vitest";
import { EditorId } from "@t3tools/contracts";

import { resolveAndPersistPreferredEditor, resolvePreferredEditor } from "./editorPreferences";
import { removeLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

const LAST_EDITOR_KEY = "t3code:last-editor";

describe("resolvePreferredEditor", () => {
  beforeEach(() => {
    removeLocalStorageItem(LAST_EDITOR_KEY);
  });

  it("prefers the configured default destination when available", () => {
    setLocalStorageItem(LAST_EDITOR_KEY, "vscode", EditorId);

    expect(resolvePreferredEditor(["terminal", "vscode"], "terminal")).toBe("terminal");
  });

  it("falls back to the last used editor when no override is configured", () => {
    setLocalStorageItem(LAST_EDITOR_KEY, "vscode", EditorId);

    expect(resolvePreferredEditor(["terminal", "vscode"])).toBe("vscode");
  });

  it("falls back to the first available option when the override is unavailable", () => {
    expect(resolvePreferredEditor(["ghostty", "vscode"], "terminal")).toBe("ghostty");
  });
});

describe("resolveAndPersistPreferredEditor", () => {
  beforeEach(() => {
    removeLocalStorageItem(LAST_EDITOR_KEY);
  });

  it("persists the configured default destination as the effective editor", () => {
    expect(resolveAndPersistPreferredEditor(["terminal", "vscode"], "terminal")).toBe("terminal");
    expect(resolvePreferredEditor(["terminal", "vscode"])).toBe("terminal");
  });
});
