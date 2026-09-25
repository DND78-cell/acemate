import type { UIMessage } from "@/lib/chat";
import { compactMessages } from "@/lib/compact";
import type {
  AceUser,
  ActivitySession,
  AiFailure,
  ChatSummary,
  ImageLimits,
  NoteSummary,
  Platform,
} from "@/platform/types";

/** AceMate as a standalone website, backed by its own server under /api. */

type ApiError = { error?: { code?: string; message?: string } };

/** Error code for a failed response whose body didn't say. */
const statusCode = (status: number) => (status === 429 ? "rate_limited" : status === 413 ? "too_large" : "upstream_error");

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        "x-acemate": "1",
        ...init.headers,
      },
    });
  } catch {
    if (init.signal?.aborted) throw { code: "cancelled" } satisfies AiFailure;
    throw { code: "network" } satisfies AiFailure;
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw {
      code: body?.error?.code ?? statusCode(res.status),
      message: body?.error?.message,
    } satisfies AiFailure;
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), signal });

// ─── Who's signed in ─────────────────────────────────────────────────────────

type Me = {
  user: { id: string; email: string } | null;
  requireSignIn: boolean;
  aiConfigured: boolean;
  images: ImageLimits;
};

let mePromise: Promise<Me | null> | null = null;
const viewerListeners = new Set<() => void>();

function loadMe(): Promise<Me | null> {
  mePromise ??= api<Me>("/api/me").catch(() => null);
  return mePromise;
}

function refreshMe() {
  mePromise = null;
  viewerListeners.forEach((fn) => fn());
}

const asViewer = (u: { id: string; email: string }): AceUser => ({ id: u.id, name: u.email, email: u.email });

// ─── Images ──────────────────────────────────────────────────────────────────

// Sizes to try, largest first. Hosts such as Vercel cap one request at about
// 4.5 MB, so all the pictures in a message together stay under IMAGE_BUDGET.
const SIZES = [
  { edge: 1568, quality: 0.85 },
  { edge: 1100, quality: 0.75 },
  { edge: 800, quality: 0.65 },
  { edge: 560, quality: 0.6 },
];
const IMAGE_BUDGET = 3_200_000; // base64 characters

type ApiImage = { mediaType: string; data: string };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.readAsDataURL(blob);
  });
}

async function encodeJpeg(bitmap: ImageBitmap, edge: number, quality: number): Promise<ApiImage> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/jpeg", quality),
  );
  return { mediaType: "image/jpeg", data: await blobToBase64(jpeg) };
}

/**
 * Resize to Claude's working size and send as JPEG, shrinking further until
 * the whole set fits the budget. A JPEG that's already small enough is sent
 * as it is when re-encoding wouldn't make it smaller.
 */
async function toApiImages(blobs: Blob[]): Promise<ApiImage[]> {
  if (!blobs.length) return [];
  const originals = await Promise.all(
    blobs.map(async (b) => ({ mediaType: b.type || "image/jpeg", data: await blobToBase64(b) })),
  );
  const bitmaps = await Promise.all(blobs.map((b) => createImageBitmap(b).catch(() => null)));
  try {
    let images = originals;
    for (const { edge, quality } of SIZES) {
      images = await Promise.all(
        bitmaps.map(async (bitmap, i) => {
          const original = originals[i];
          if (!bitmap) return original;
          const fits = original.mediaType === "image/jpeg" && Math.max(bitmap.width, bitmap.height) <= edge;
          try {
            const encoded = await encodeJpeg(bitmap, edge, quality);
            return fits && original.data.length <= encoded.data.length ? original : encoded;
          } catch {
            return original;
          }
        }),
      );
      if (images.reduce((n, img) => n + img.data.length, 0) <= IMAGE_BUDGET) break;
    }
    return images;
  } finally {
    bitmaps.forEach((b) => b?.close());
  }
}

// ─── Streaming answers ───────────────────────────────────────────────────────

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "done"; truncated?: boolean }
  | { type: "error"; code: string };

export const webPlatform: Platform = {
  kind: "web",

  async chat(call, { signal, onText, onReasoning }) {
    const images = await toApiImages(call.images);
    let res: Response;
    try {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-acemate": "1" },
        body: JSON.stringify({
          system: call.instructions,
          turns: call.turns,
          images,
          model: call.model,
          effort: call.effort,
        }),
        signal,
      });
    } catch {
      throw { code: signal.aborted ? "cancelled" : "network" } satisfies AiFailure;
    }
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as ApiError | null;
      throw {
        code: body?.error?.code ?? statusCode(res.status),
        message: body?.error?.message,
      } satisfies AiFailure;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let reasoning = "";
    const handle = (line: string): boolean => {
      if (!line.trim()) return false;
      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        return false;
      }
      if (event.type === "text") {
        text += event.delta;
        onText(text);
      } else if (event.type === "reasoning") {
        reasoning += event.delta;
        onReasoning(reasoning);
      } else if (event.type === "error") {
        throw { code: event.code, text: text || undefined } satisfies AiFailure;
      } else if (event.type === "done") {
        return true;
      }
      return false;
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (handle(line)) return { text };
      }
      if (handle(buffer)) return { text };
    } catch (e) {
      if ((e as AiFailure)?.code) throw e;
      throw { code: signal.aborted ? "cancelled" : "network", text: text || undefined } satisfies AiFailure;
    }
    throw { code: "upstream_error", text: text || undefined } satisfies AiFailure;
  },

  async notes({ prompt, images, model, effort }) {
    const payload = await toApiImages(images);
    const { result } = await post<{ result: unknown }>("/api/ai/notes", { prompt, images: payload, model, effort });
    return result;
  },

  async imageLimits() {
    const me = await loadMe();
    return me?.images ?? null;
  },

  async viewer() {
    const me = await loadMe();
    return me?.user ? asViewer(me.user) : null;
  },

  onViewerChange(fn) {
    viewerListeners.add(fn);
    return () => viewerListeners.delete(fn);
  },

  accounts: {
    async signIn(email, password) {
      try {
        await post("/api/auth/signin", { email, password });
        refreshMe();
        return {};
      } catch (e) {
        return { error: (e as AiFailure).message ?? "Couldn't sign in. Try again." };
      }
    },
    async signUp(email, password) {
      try {
        await post("/api/auth/signup", { email, password });
        refreshMe();
        return {};
      } catch (e) {
        return { error: (e as AiFailure).message ?? "Couldn't create the account. Try again." };
      }
    },
    async signOut() {
      await post("/api/auth/signout", {}).catch(() => undefined);
      refreshMe();
    },
  },

  store: {
    async saveChat(chatId: string, messages: UIMessage[]) {
      if (!messages.length || !(await loadMe())?.user) return;
      try {
        const compact = await compactMessages(messages);
        await api(`/api/chats/${encodeURIComponent(chatId)}`, {
          method: "PUT",
          body: JSON.stringify({ messages: compact }),
        });
      } catch (error) {
        console.error("saveChat failed", error);
      }
    },
    async listChats(): Promise<ChatSummary[]> {
      if (!(await loadMe())?.user) return [];
      return api<{ chats: ChatSummary[] }>("/api/chats").then((r) => r.chats, () => []);
    },
    async loadChat(chatId: string) {
      if (!(await loadMe())?.user) return null;
      return api<{ messages: UIMessage[] }>(`/api/chats/${encodeURIComponent(chatId)}`).then(
        (r) => r.messages,
        () => null,
      );
    },
    async saveNotes(subject: string, result: unknown) {
      if (!(await loadMe())?.user) return;
      await post("/api/notes", { subject, result }).catch((error) => console.error("saveNotes failed", error));
    },
    async listNotes(): Promise<NoteSummary[]> {
      if (!(await loadMe())?.user) return [];
      return api<{ notes: NoteSummary[] }>("/api/notes").then((r) => r.notes, () => []);
    },
    async loadNote(id: string) {
      if (!(await loadMe())?.user) return null;
      return api<{ result: unknown }>(`/api/notes/${encodeURIComponent(id)}`).then(
        (r) => r.result,
        () => null,
      );
    },
    async saveCompanionSessionStart(subject: string) {
      if (!(await loadMe())?.user) return null;
      return post<{ id: string }>("/api/companion", { subject }).then(
        (r) => r.id,
        () => null,
      );
    },
    async setCompanionSessionCount(sessionId: string, count: number) {
      if (!(await loadMe())?.user) return;
      await api(`/api/companion/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ message_count: count }),
      }).catch(() => undefined);
    },
    async listCompanionActivity(year: number, month: number): Promise<ActivitySession[]> {
      if (!(await loadMe())?.user) return [];
      return api<{ sessions: ActivitySession[] }>(`/api/companion/activity?year=${year}&month=${month}`).then(
        (r) => r.sessions,
      );
    },
  },

  async download(filename, data) {
    try {
      const url = URL.createObjectURL(new Blob([data], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "saved";
    } catch {
      return "unavailable";
    }
  },
};
