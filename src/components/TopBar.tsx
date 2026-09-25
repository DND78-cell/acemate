import type { ReactNode } from "react";
import { PanelLeftOpen, SquarePen } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useShell } from "@/components/AppShell";
import { requestChat } from "@/lib/chat-nav";

export function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * The slim bar at the top of every screen. It carries the sidebar toggle
 * whenever the sidebar is hidden, plus a New chat shortcut in that case.
 */
export function TopBar({
  title,
  leading,
  trailing,
}: {
  title?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const shell = useShell();
  const navigate = useNavigate();
  const sidebarHidden = !shell.isDesktop || !shell.sidebarOpen;

  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1 bg-[var(--bg)] px-2 md:pl-8">
      {sidebarHidden && (
        <>
          <IconButton label="Open sidebar" onClick={shell.openSidebar}>
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="New chat"
            onClick={() => {
              requestChat({ type: "new" });
              void navigate({ to: "/" });
            }}
          >
            <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.75} />
          </IconButton>
        </>
      )}
      {leading}
      <div className="min-w-0 flex-1 truncate px-1.5 text-[14px] text-[var(--fg)]">{title}</div>
      {trailing}
    </header>
  );
}
