import type { ProjectGitNamingSettings } from "../types";
import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ProjectGitNamingControlProps {
  gitNaming: ProjectGitNamingSettings;
  effectiveGitNaming: {
    worktreeBranchPrefix: string;
    featureBranchPrefix: string;
    worktreeRootName: string;
  };
  onSave: (gitNaming: ProjectGitNamingSettings) => Promise<void> | void;
}

export default function ProjectGitNamingControl({
  gitNaming,
  effectiveGitNaming,
  onSave,
}: ProjectGitNamingControlProps) {
  const [open, setOpen] = useState(false);
  const [worktreeBranchPrefix, setWorktreeBranchPrefix] = useState("");
  const [featureBranchPrefix, setFeatureBranchPrefix] = useState("");
  const [worktreeRootName, setWorktreeRootName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWorktreeBranchPrefix(gitNaming.worktreeBranchPrefix ?? "");
    setFeatureBranchPrefix(gitNaming.featureBranchPrefix ?? "");
    setWorktreeRootName(gitNaming.worktreeRootName ?? "");
    setError(null);
  }, [gitNaming, open]);

  const handleSave = async () => {
    try {
      await onSave({
        worktreeBranchPrefix: worktreeBranchPrefix.trim() || null,
        featureBranchPrefix: featureBranchPrefix.trim() || null,
        worktreeRootName: worktreeRootName.trim() || null,
      });
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save project settings.");
    }
  };

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)} title="Project git naming">
        <SettingsIcon className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project Git Naming</DialogTitle>
            <DialogDescription>
              Leave a field blank to inherit the global setting for this project.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <label className="grid gap-1.5">
              <Label>Worktree branch prefix</Label>
              <Input
                value={worktreeBranchPrefix}
                onChange={(event) => setWorktreeBranchPrefix(event.target.value)}
                placeholder={effectiveGitNaming.worktreeBranchPrefix}
              />
            </label>
            <label className="grid gap-1.5">
              <Label>Feature branch prefix</Label>
              <Input
                value={featureBranchPrefix}
                onChange={(event) => setFeatureBranchPrefix(event.target.value)}
                placeholder={effectiveGitNaming.featureBranchPrefix}
              />
            </label>
            <label className="grid gap-1.5">
              <Label>Worktree root folder</Label>
              <Input
                value={worktreeRootName}
                onChange={(event) => setWorktreeRootName(event.target.value)}
                placeholder={effectiveGitNaming.worktreeRootName}
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
