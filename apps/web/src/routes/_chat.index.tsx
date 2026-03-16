import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { cn, resolveDesktopTitlebarInsetPx } from "../lib/utils";
import { SidebarTrigger, useSidebar } from "../components/ui/sidebar";

function ChatIndexRouteView() {
  const desktopTitlebarInsetPx = resolveDesktopTitlebarInsetPx();
  const { isMobile, open: sidebarOpen } = useSidebar();
  const shouldReserveDesktopTitlebarInset = isElectron && !isMobile && !sidebarOpen;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">Threads</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div
          className={cn(
            "drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5",
          )}
          style={{
            paddingLeft:
              shouldReserveDesktopTitlebarInset && desktopTitlebarInsetPx > 0
                ? `${desktopTitlebarInsetPx}px`
                : undefined,
          }}
        >
          <span className="text-xs text-muted-foreground/50">No active thread</span>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm">Select a thread or create a new one to get started.</p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
