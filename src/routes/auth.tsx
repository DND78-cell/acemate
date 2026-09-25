import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AceMateLogo } from "@/components/AceMateLogo";
import { Notice } from "@/components/Notice";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/hooks/use-auth";
import { platform } from "@/platform";

/** Sign in / create an account (standalone website only). */
export function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Signed in already, or on claude.ai where the account is the viewer's.
    if (user || !platform.accounts) void navigate({ to: "/", replace: true });
  }, [user, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!platform.accounts) return;
    setError(null);
    setBusy(true);
    const result =
      mode === "signup"
        ? await platform.accounts.signUp(email, password)
        : await platform.accounts.signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
  };

  const field = "field h-12 w-full rounded-xl px-4 text-[15px]";

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[440px] flex-col px-4 pb-12 pt-[6vh]">
          <div className="glass-panel msg-in rounded-[24px] px-6 py-8 sm:px-8">
          <div className="flex flex-col items-center text-center">
            <AceMateLogo size={44} glow />
            <h1 className="font-display mt-6 text-[28px] font-semibold leading-tight text-[var(--fg)]">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="mt-2 text-[14.5px] text-[var(--fg-muted)]">
              Save your chats and notes. You can always keep using AceMate as a guest.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder={mode === "signin" ? "Password" : "Password (at least 8 characters)"}
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />

            {error && <Notice>{error}</Notice>}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary mt-1 h-12 rounded-full text-[15px] font-medium"
            >
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="mt-6 w-full text-center text-[14px] text-[var(--fg-muted)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--fg)]"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
          <Link to="/" className="mt-3 block text-center text-[14px] text-[var(--fg-faint)] transition-colors hover:text-[var(--fg-muted)]">
            Continue as guest
          </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
