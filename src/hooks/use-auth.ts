import { useEffect, useState } from "react";
import { platform } from "@/platform";
import type { AceUser } from "@/platform/types";

export type { AceUser } from "@/platform/types";

/** Who's using AceMate: the claude.ai viewer, or the website's signed-in account. */
export function useAuth() {
  const [user, setUser] = useState<AceUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      void platform.viewer().then((u) => {
        if (!active) return;
        setUser(u);
        setLoading(false);
      });
    load();
    const stop = platform.onViewerChange(load);
    return () => {
      active = false;
      stop();
    };
  }, []);

  return { user, loading };
}
