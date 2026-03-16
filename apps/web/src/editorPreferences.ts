import { EDITORS, EditorId, NativeApi } from "@t3tools/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

const LAST_EDITOR_KEY = "t3code:last-editor";

export function resolvePreferredEditor(
  availableEditors: readonly EditorId[],
  defaultEditorOverride: EditorId | null = null,
): EditorId | null {
  const availableEditorIds = new Set(availableEditors);
  if (defaultEditorOverride && availableEditorIds.has(defaultEditorOverride)) {
    return defaultEditorOverride;
  }

  const stored = getLocalStorageItem(LAST_EDITOR_KEY, EditorId);
  if (stored && availableEditorIds.has(stored)) return stored;

  return EDITORS.find((editor) => availableEditorIds.has(editor.id))?.id ?? null;
}

export function usePreferredEditor(
  availableEditors: ReadonlyArray<EditorId>,
  defaultEditorOverride: EditorId | null = null,
) {
  const [lastEditor, setLastEditor] = useLocalStorage(LAST_EDITOR_KEY, null, EditorId);

  const effectiveEditor = useMemo(() => {
    if (defaultEditorOverride && availableEditors.includes(defaultEditorOverride)) {
      return defaultEditorOverride;
    }
    if (lastEditor && availableEditors.includes(lastEditor)) return lastEditor;
    return EDITORS.find((editor) => availableEditors.includes(editor.id))?.id ?? null;
  }, [availableEditors, defaultEditorOverride, lastEditor]);

  return [effectiveEditor, setLastEditor] as const;
}

export function resolveAndPersistPreferredEditor(
  availableEditors: readonly EditorId[],
  defaultEditorOverride: EditorId | null = null,
): EditorId | null {
  const editor = resolvePreferredEditor(availableEditors, defaultEditorOverride);
  if (editor) setLocalStorageItem(LAST_EDITOR_KEY, editor, EditorId);
  return editor ?? null;
}

export async function openInPreferredEditor(
  api: NativeApi,
  targetPath: string,
  defaultEditorOverride: EditorId | null = null,
): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors, defaultEditorOverride);
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
