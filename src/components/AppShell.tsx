import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";

type Shell = {
  isDesktop: boolean;
  /** Desktop: whether the sidebar column is showing. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Phone: whether the sidebar drawer is over the page. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Show the sidebar however this screen size shows it. */
  openSidebar: () => void;
};

const ShellContext = createContext<Shell | null>(null);

const DESKTOP_QUERY = "(min-width: 768px)";
const SIDEBAR_KEY = "acemate.sidebarOpen";

function matchesDesktop(): boolean {
  try {
    return window.matchMedia(DESKTOP_QUERY).matches;
  } catch {
    return true;
  }
}

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside AppShell");
  return shell;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(matchesDesktop);
  const [sidebarOpen, setSidebarOpenState] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer's contents (with their metal shaders) exist only while it's
  // open, plus the moment it takes to slide away.
  const [drawerMounted, setDrawerMounted] = useState(false);
  useEffect(() => {
    if (drawerOpen) {
      setDrawerMounted(true);
      return;
    }
    const t = setTimeout(() => setDrawerMounted(false), 250);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      setIsDesktop(mql.matches);
      if (mql.matches) setDrawerOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
    } catch {
      /* remembered for this visit only */
    }
  };

  const shell: Shell = {
    isDesktop,
    sidebarOpen,
    setSidebarOpen,
    drawerOpen,
    setDrawerOpen,
    openSidebar: () => (isDesktop ? setSidebarOpen(true) : setDrawerOpen(true)),
  };

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-full w-full overflow-hidden bg-[var(--bg)]">
        {isDesktop && sidebarOpen && (
          <div className="h-full w-[260px] shrink-0">
            <AppSidebar onNavigate={() => undefined} onClose={() => setSidebarOpen(false)} />
          </div>
        )}
        <main className="relative flex h-full min-w-0 flex-1 flex-col">
          {/* The spiral binding between the cover and the page. */}
          {isDesktop && <div className="spiral" aria-hidden="true" />}
          {children}
        </main>
      </div>

      {!isDesktop && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-40 transition-opacity duration-200 ${
              drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            style={{ background: "var(--overlay-bg)" }}
          />
          <div
            role="dialog"
            aria-label="Navigation"
            aria-hidden={!drawerOpen}
            inert={!drawerOpen}
            className={`fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85%] border-r border-[var(--line)] shadow-2xl transition-transform duration-200 ease-out ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {drawerMounted && (
              <AppSidebar onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
            )}
          </div>
        </>
      )}
    </ShellContext.Provider>
  );
}
