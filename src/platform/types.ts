import type { UIMessage } from "@/lib/chat";
import type { EffortMode, ModelId } from "@/lib/settings";

/**
 * Everything AceMate needs from where it runs. Two implementations:
 *   artifact - a claude.ai page (Claude via `sample`, saving via `db`/`user`)
 *   web      - the standalone website (its own server under /api)
 */

export type Tier = "quick" | "default" | "complex";
export type Turn = { role: "user" | "assistant"; content: string };

/**
 * A failed AI call. `code` is stable; `text` is any answer that streamed first.
 * A `rate_limited` refusal from the website's server also says which limit
 * (`limit`), how many seconds until it resets (`retryAfter`), and whether the
 * caller is a guest.
 */
export type AiFailure = {
  code: string;
  message?: string;
  text?: string;
  limit?: UsageWindow;
  retryAfter?: number;
  guest?: boolean;
};

export type UsageWindow = "hour" | "week";

/** One AI budget: how much of this window is used, and when it starts over. */
export type UsageLimit = {
  id: UsageWindow;
  used: number;
  limit: number;
  windowSeconds: number;
  /** ISO time; null until the first request starts the window. */
  resetsAt: string | null;
};

export type UsageReport = {
  plan: "account" | "guest";
  limits: UsageLimit[];
  /** For guests: what an account would get. */
  accountLimits?: Record<UsageWindow, number>;
};

export type ImageLimits = { maxCount: number; maxInputBytes: number; mediaTypes: string[] };

export type AceUser = { id: string; name: string; email?: string; avatarUrl?: string };

export type ChatCall = {
  instructions: string;
  turns: Turn[];
  images: Blob[];
  model: ModelId;
  effort: EffortMode;
  tier: Tier;
};

export type ChatHandlers = {
  signal: AbortSignal;
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
};

export type ChatSummary = { id: string; title: string; updated_at: string };
export type NoteSummary = { id: string; subject: string; created_at: string; title: string | null };
export type ActivitySession = { started_at: string; message_count: number };

export interface Store {
  saveChat(chatId: string, messages: UIMessage[]): Promise<void>;
  listChats(): Promise<ChatSummary[]>;
  loadChat(chatId: string): Promise<UIMessage[] | null>;
  saveNotes(subject: string, result: unknown): Promise<void>;
  listNotes(): Promise<NoteSummary[]>;
  loadNote(id: string): Promise<unknown | null>;
  saveCompanionSessionStart(subject: string): Promise<string | null>;
  setCompanionSessionCount(sessionId: string, count: number): Promise<void>;
  listCompanionActivity(year: number, month: number): Promise<ActivitySession[]>;
}

export interface Accounts {
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(email: string, password: string): Promise<{ error?: string }>;
  signOut(): Promise<void>;
}

export interface Platform {
  kind: "artifact" | "web";
  /** Stream one answer; resolves with the whole text, rejects with an AiFailure. */
  chat(call: ChatCall, handlers: ChatHandlers): Promise<{ text: string; tierApplied?: Tier }>;
  /** One structured Chapter Notes answer as parsed JSON; rejects with an AiFailure. */
  notes(req: { prompt: string; images: Blob[]; model: ModelId; effort: EffortMode }): Promise<unknown>;
  imageLimits(): Promise<ImageLimits | null>;
  /** The caller's AI budgets; null where limits aren't AceMate's own (claude.ai). */
  usage(): Promise<UsageReport | null>;
  viewer(): Promise<AceUser | null>;
  onViewerChange(fn: () => void): () => void;
  /** Email/password sign-in; only the standalone website has it. */
  accounts: Accounts | null;
  store: Store;
  /** Offer text as a file download. */
  download(filename: string, data: string): Promise<"saved" | "declined" | "unavailable">;
}
