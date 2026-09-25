import {
  Link,
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useSettings } from "@/lib/settings";
import { AppShell } from "@/components/AppShell";
import { ChatPage } from "@/routes/index";
import { CodePage } from "@/routes/code";
import { CompanionPage } from "@/routes/companion";
import { NotesPage } from "@/routes/notes";
import { SettingsPage } from "@/routes/settings";
import { AuthPage } from "@/routes/auth";
import { IS_WEB } from "@/platform";

function NotFoundComponent() {
  return (
    <div className="flex h-full items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  const [settings] = useSettings();

  useEffect(() => {
    document.body.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: ChatPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/notes", component: NotesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/companion", component: CompanionPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/code", component: CodePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/auth", component: AuthPage }),
]);

const SCREENS = ["notes", "companion", "code", "settings"];

/** A link ending in #notes, #companion, #code or #settings opens that screen. */
function initialPath(): string {
  try {
    const anchor = window.location.hash.replace(/^#/, "");
    return SCREENS.includes(anchor) ? `/${anchor}` : "/";
  } catch {
    return "/";
  }
}

// The website uses real page addresses; a claude.ai page keeps them in memory.
export const router = createRouter({
  routeTree,
  ...(IS_WEB ? {} : { history: createMemoryHistory({ initialEntries: [initialPath()] }) }),
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
