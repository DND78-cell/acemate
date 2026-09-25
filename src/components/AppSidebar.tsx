import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Code2,
  PanelLeftClose,
  Plus,
  ScanText,
  Settings as SettingsIcon,
  LogIn,
  UserRound,
} from "lucide-react";
import { AceMateLogo } from "@/components/AceMateLogo";
import { useAuth } from "@/hooks/use-auth";
import { listChats, type ChatSummary } from "@/lib/persistence";
import { requestChat, useChatNavState } from "@/lib/chat-nav";
import { IS_WEB, platform } from "@/platform";

const PAGES = [
  { label: "Chapter notes", to: "/notes", icon: ScanText },
  { label: "Study companion", to: "/companion", icon: BookOpen },
  { label: "Code", to: "/code", icon: Code2 },
] as const;

const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] ?? "";

const rowClass = (active: boolean) =>
  `flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] transition-colors ${
    active
      ? "bg-[var(--surface-hover)] text-[var(--fg)]"
      : "text-[var(--fg)] hover:bg-[var(--surface-hover)]"
  }`;

export function AppSidebar({
  onNavigate,
  onClose,
}: {
  /** Called after any navigation, so the phone drawer can close. */
  onNavigate: () => void;
  onClose: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { activeChatId, recentsVersion } = useChatNavState();
  const [recents, setRecents] = useState<ChatSummary[]>([]);

  useEffect(() => {
    if (!user) {
      setRecents([]);
      return;
    }
    let active = true;
    void listChats().then((rows) => {
      if (active) setRecents(rows);
    });
    return () => {
      active = false;
    };
  }, [user, recentsVersion]);

  const newChat = () => {
    requestChat({ type: "new" });
    void navigate({ to: "/" });
    onNavigate();
  };

  const openChat = (id: string) => {
    requestChat({ type: "open", id });
    void navigate({ to: "/" });
    onNavigate();
  };

  const settingsActive = pathname.startsWith("/settings");

  return (
    <nav aria-label="AceMate" className="cover flex h-full flex-col">
      {/* The name label on the notebook's cover. */}
      <div className="flex shrink-0 items-start gap-1 pl-3 pr-2 pt-3">
        <div className="cover-label min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 text-[19px] font-bold leading-6">
            <AceMateLogo size={16} />
            AceMate
          </div>
          <div className="cover-label-line mt-1">
            <span className="label-mono">Name</span>
            <span className="hand min-w-0 truncate">{loading ? "" : firstName(user?.name) || "Guest"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        >
          <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={newChat}
          className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New chat
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-0.5 px-2">
        <div className="label-mono px-2.5 pb-2">Study</div>
        {PAGES.map((page) => {
          const Icon = page.icon;
          return (
            <Link
              key={page.to}
              to={page.to}
              onClick={onNavigate}
              className={rowClass(pathname.startsWith(page.to))}
            >
              <Icon className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} />
              {page.label}
            </Link>
          );
        })}
      </div>

      <div className="scrollbar-thin mt-6 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="label-mono px-2.5 pb-2">Recent chats</div>
        {!user ? (
          <p className="px-2.5 py-1 text-[13px] leading-snug text-[var(--fg-faint)]">
            {loading
              ? ""
              : IS_WEB
                ? "Sign in to save your chats."
                : "Chats are saved when you open AceMate signed in to claude.ai."}
          </p>
        ) : recents.length === 0 ? (
          <p className="px-2.5 py-1 text-[13px] text-[var(--fg-faint)]">Your chats will appear here.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {recents.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => openChat(chat.id)}
                  className={`${rowClass(pathname === "/" && chat.id === activeChatId)} h-8`}
                >
                  <span className="truncate">{chat.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-[var(--line)] px-2 py-2">
        <div className="min-w-0 flex-1">
          {!user && !loading && IS_WEB ? (
            <Link to="/auth" onClick={onNavigate} className={`${rowClass(pathname === "/auth")} h-11`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)]">
                <LogIn className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13.5px]">Sign in</span>
                <span className="block truncate text-[12px] text-[var(--fg-faint)]">Save your chats and notes</span>
              </span>
            </Link>
          ) : (
            <div className="flex h-11 items-center gap-2.5 rounded-lg px-2.5">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[12px] font-medium uppercase text-[var(--fg)]">
                  {user ? (user.name || "?").slice(0, 1) : <UserRound className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} />}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13.5px] text-[var(--fg)]">
                  {user ? user.name || "Signed in" : loading ? "" : "Guest"}
                </div>
                {user && platform.accounts ? (
                  <button
                    type="button"
                    onClick={() => void platform.accounts?.signOut()}
                    className="text-[12px] text-[var(--fg-faint)] underline-offset-2 hover:text-[var(--fg)] hover:underline"
                  >
                    Sign out
                  </button>
                ) : (
                  <div className="truncate text-[12px] text-[var(--fg-faint)]">
                    {user ? (IS_WEB ? "Signed in" : "Saved to claude.ai") : loading ? "" : "Chats aren't saved"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <Link
          to="/settings"
          onClick={onNavigate}
          aria-label="Settings"
          title="Settings"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] ${
            settingsActive ? "bg-[var(--surface-hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]"
          }`}
        >
          <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
      </div>
    </nav>
  );
}
