import type { ReactNode } from "react";
import { PanelLeftOpen, SquarePen } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useShell } from "@/components/AppShell";
import { AceMateLogo } from "@/components/AceMateLogo";
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
    <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled} className="round-btn">
      {children}
    </button>
  );
}

/**
 * The slim, transparent bar at the top of every screen. When the sidebar is
 * hidden it carries the sidebar toggle and a New chat shortcut; on phones
 * the AceMate mark sits in the middle when there's no title.
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
  const showBrand = !shell.isDesktop && !title;

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
      {sidebarHidden && (
        <IconButton label="Open sidebar" onClick={shell.openSidebar}>
          <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </IconButton>
      )}
      {leading}
      {showBrand ? (
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--fg)]">
          <AceMateLogo size={22} />
          AceMate
        </div>
      ) : (
        <div className="min-w-0 flex-1 truncate px-1.5 text-[14px] text-[var(--fg-muted)]">{title}</div>
      )}
      {trailing}
      {sidebarHidden && (
        <IconButton
          label="New chat"
          onClick={() => {
            requestChat({ type: "new" });
            void navigate({ to: "/" });
          }}
        >
          <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.6} />
        </IconButton>
      )}
    </header>
  );
}
