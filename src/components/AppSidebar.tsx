import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Code2,
  LogIn,
  NotebookPen,
  PanelLeftClose,
  Plus,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { AceMateLogo } from "@/components/AceMateLogo";
import { useAuth } from "@/hooks/use-auth";
import { listChats, type ChatSummary } from "@/lib/persistence";
import { requestChat, useChatNavState } from "@/lib/chat-nav";
import { IS_WEB, platform } from "@/platform";

const STUDY = [
  { label: "Notes & quizzes", to: "/notes", icon: NotebookPen },
  { label: "Study companion", to: "/companion", icon: BookOpen },
  { label: "Code", to: "/code", icon: Code2 },
] as const;

const ICON = "h-[17px] w-[17px] shrink-0";

const rowClass = (active: boolean) =>
  `group flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors duration-200 ${
    active
      ? "bg-[var(--glass-strong)] text-[var(--fg)]"
      : "text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
  }`;

const iconClass = (active: boolean) =>
  `${ICON} transition-colors duration-200 ${active ? "text-[var(--accent-ink)]" : "text-[var(--fg-faint)] group-hover:text-[var(--fg-muted)]"}`;

/** The floating glass sidebar: new chat, recent conversations, study tools, settings. */
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
    <nav aria-label="AceMate" className="glass-panel flex h-full flex-col rounded-[22px]">
      <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
        <button
          type="button"
          onClick={newChat}
          className="flex items-center gap-2.5 rounded-lg text-[16px] font-semibold tracking-[-0.01em] text-[var(--fg)]"
        >
          <AceMateLogo size={24} />
          AceMate
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          data-drawer-focus
          className="round-btn h-8 w-8"
        >
          <PanelLeftClose className={ICON} strokeWidth={1.6} />
        </button>
      </div>

      <div className="px-3 pt-1">
        <button
          type="button"
          onClick={newChat}
          className="chip flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium hover:-translate-y-px"
        >
          <Plus className="h-4 w-4 text-[var(--accent-ink)]" strokeWidth={1.8} />
          New chat
        </button>
      </div>

      <div className="scrollbar-thin mt-5 min-h-0 flex-1 overflow-y-auto px-2">
        <div className="section-label px-3 pb-1.5">Recent</div>
        {!user ? (
          <p className="px-3 py-1 text-[13px] leading-snug text-[var(--fg-faint)]">
            {loading
              ? ""
              : IS_WEB
                ? "Sign in to keep your conversations."
                : "Conversations are saved when you open AceMate signed in to claude.ai."}
          </p>
        ) : recents.length === 0 ? (
          <p className="px-3 py-1 text-[13px] text-[var(--fg-faint)]">Your conversations will appear here.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 pb-2">
            {recents.map((chat) => {
              const active = pathname === "/" && chat.id === activeChatId;
              return (
                <li key={chat.id}>
                  <button type="button" onClick={() => openChat(chat.id)} className={`${rowClass(active)} h-8 text-[13.5px]`}>
                    <span className="truncate">{chat.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 px-2 pt-3">
        <div className="section-label px-3 pb-1.5">Study</div>
        <div className="flex flex-col gap-0.5">
          {STUDY.map((page) => {
            const Icon = page.icon;
            const active = pathname.startsWith(page.to);
            return (
              <Link key={page.to} to={page.to} onClick={onNavigate} className={rowClass(active)}>
                <Icon className={iconClass(active)} strokeWidth={1.6} />
                {page.label}
              </Link>
            );
          })}
          <Link to="/settings" onClick={onNavigate} className={rowClass(settingsActive)}>
            <SettingsIcon className={iconClass(settingsActive)} strokeWidth={1.6} />
            Settings
          </Link>
        </div>
      </div>

      <div className="mx-3 mt-3 shrink-0 border-t border-[var(--line)] py-2">
        {!user && !loading && IS_WEB ? (
          <Link to="/auth" onClick={onNavigate} className={`${rowClass(pathname === "/auth")} h-12 px-2`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--glass-strong)]">
              <LogIn className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.6} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13.5px] text-[var(--fg)]">Sign in</span>
              <span className="block truncate text-[12px] text-[var(--fg-faint)]">Save your chats and notes</span>
            </span>
          </Link>
        ) : (
          <div className="flex h-12 items-center gap-2.5 px-2">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.35),rgba(var(--accent-2-rgb),0.25))] text-[12px] font-semibold uppercase text-[var(--fg)]">
                {user ? (user.name || "?").slice(0, 1) : <UserRound className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.6} />}
              </span>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13.5px] text-[var(--fg)]">
                {user ? user.name || "Signed in" : loading ? "" : "Guest"}
              </div>
              <div className="truncate text-[12px] text-[var(--fg-faint)]">
                {user ? (IS_WEB ? "Signed in" : "Saved to claude.ai") : loading ? "" : "Chats aren't saved"}
              </div>
            </div>
            {user && platform.accounts && (
              <button
                type="button"
                onClick={() => void platform.accounts?.signOut()}
                className="shrink-0 rounded-lg px-2 py-1 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
