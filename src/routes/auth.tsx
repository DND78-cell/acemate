import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AceMateLogo } from "@/components/AceMateLogo";
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

  const field =
    "h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[15px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--line-strong)]";

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[400px] flex-col px-5 pb-12 pt-[8vh]">
          <div className="flex flex-col items-center text-center">
            <AceMateLogo size={40} />
            <h1 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--fg)]">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="mt-2 text-[14.5px] text-[var(--fg-muted)]">
              Save your chats and Chapter Notes. You can always keep using AceMate as a guest.
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

            {error && (
              <div role="alert" className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-4 py-3 text-[13.5px] text-[var(--fg)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-12 rounded-xl bg-[var(--primary-bg)] text-[15px] font-medium text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
            className="mt-5 text-[14px] text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg)]"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
          <Link to="/" className="mt-3 text-center text-[14px] text-[var(--fg-faint)] hover:text-[var(--fg-muted)]">
            Continue as guest
          </Link>
        </div>
      </div>
    </div>
  );
}
