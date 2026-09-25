import { getDb, getUser } from "@/lib/claude";
import type { UIMessage } from "@/lib/chat";
import type { ActivitySession, ChatSummary, NoteSummary, Store } from "@/platform/types";
import { compactMessages, MAX_DOC_CHARS } from "@/lib/compact";

/**
 * Saved data on claude.ai. Everything lives in the signed-in person's
 * private space (data/users/<id>/…), which nobody else can read — the
 * claude.ai account plays the part Supabase auth did. Every function is a
 * no-op without an identity: guest mode keeps working and never saves.
 */

type Root = { root: DocumentReference };

let rootPromise: Promise<Root | null> | null = null;
function getRoot(): Promise<Root | null> {
  rootPromise ??= (async () => {
    const [db, user] = await Promise.all([getDb(), getUser()]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    return { root: db.doc(`data/users/${uid}/acemate`) };
  })().catch(() => null);
  return rootPromise;
}

/** One write at a time per document, as the store asks. */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

function titleFromMessages(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.find((p) => p.type === "text")?.text?.trim() ?? "";
  if (!text) return "New chat";
  const clipped = text.length > 40 ? text.slice(0, 40) : text;
  const trimmed = clipped.replace(/[\s.,;:!?—-]+$/u, "").trim();
  return trimmed || "New chat";
}

async function saveChat(chatId: string, messages: UIMessage[]) {
  if (messages.length === 0) return;
  const r = await getRoot();
  if (!r) return;
  const now = new Date().toISOString();
  const chatRef = r.root.collection("chats").doc(chatId);
  const indexRef = r.root.collection("chatIndex").doc(chatId);
  try {
    let compact = await compactMessages(messages);
    // Drop the oldest turns if a very long conversation still doesn't fit.
    while (compact.length > 2 && JSON.stringify(compact).length > MAX_DOC_CHARS) {
      compact = compact.slice(2);
    }
    await serial(chatRef.path, async () => {
      // Update first so the original title stays fixed after the first save.
      const existing = await indexRef.get();
      const title = (existing.exists && typeof existing.data()?.title === "string"
        ? (existing.data()!.title as string)
        : titleFromMessages(messages));
      await chatRef.set({ messages: compact, updated_at: now });
      await indexRef.set({ title, updated_at: now });
    });
  } catch (error) {
    console.error("saveChat failed", error);
  }
}

async function listChats(): Promise<ChatSummary[]> {
  const r = await getRoot();
  if (!r) return [];
  try {
    const snap = await r.root.collection("chatIndex").orderBy("updated_at", "desc").limit(20).get();
    return snap.docs.map((d) => {
      const data = d.data() ?? {};
      return {
        id: d.id,
        title: typeof data.title === "string" ? data.title : "New chat",
        updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
      };
    });
  } catch (error) {
    console.error("listChats failed", error);
    return [];
  }
}

async function loadChat(chatId: string): Promise<UIMessage[] | null> {
  const r = await getRoot();
  if (!r) return null;
  try {
    const snap = await r.root.collection("chats").doc(chatId).get();
    if (!snap.exists) return null;
    const messages = snap.data()?.messages;
    return Array.isArray(messages) ? (JSON.parse(JSON.stringify(messages)) as UIMessage[]) : [];
  } catch (error) {
    console.error("loadChat failed", error);
    return null;
  }
}

async function saveNotes(subject: string, result: unknown) {
  const r = await getRoot();
  if (!r) return;
  try {
    const title =
      result && typeof (result as { title?: unknown }).title === "string"
        ? (result as { title: string }).title
        : null;
    await r.root.collection("notes").add({
      subject,
      title,
      result: result as Record<string, unknown>,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("saveNotes failed", error);
  }
}

async function listNotes(): Promise<NoteSummary[]> {
  const r = await getRoot();
  if (!r) return [];
  try {
    const snap = await r.root.collection("notes").orderBy("created_at", "desc").limit(20).get();
    return snap.docs.map((d) => {
      const data = d.data() ?? {};
      return {
        id: d.id,
        subject: typeof data.subject === "string" ? data.subject : "",
        created_at: typeof data.created_at === "string" ? data.created_at : "",
        title: typeof data.title === "string" ? data.title : null,
      };
    });
  } catch (error) {
    console.error("listNotes failed", error);
    return [];
  }
}

async function loadNote(id: string): Promise<unknown | null> {
  const r = await getRoot();
  if (!r) return null;
  try {
    const snap = await r.root.collection("notes").doc(id).get();
    if (!snap.exists) return null;
    const result = snap.data()?.result;
    return result ? JSON.parse(JSON.stringify(result)) : null;
  } catch (error) {
    console.error("loadNote failed", error);
    return null;
  }
}

async function saveCompanionSessionStart(subject: string): Promise<string | null> {
  const r = await getRoot();
  if (!r) return null;
  try {
    const ref = await r.root.collection("companion").add({
      subject: subject.trim(),
      message_count: 1,
      started_at: new Date().toISOString(),
    });
    return ref.id;
  } catch (error) {
    console.error("saveCompanionSessionStart failed", error);
    return null;
  }
}

/** Record how many messages the session has had (absolute, never read-modify-write). */
async function setCompanionSessionCount(sessionId: string, count: number) {
  const r = await getRoot();
  if (!r) return;
  const ref = r.root.collection("companion").doc(sessionId);
  try {
    await serial(ref.path, () => ref.update({ message_count: count }));
  } catch (error) {
    console.error("setCompanionSessionCount failed", error);
  }
}

async function listCompanionActivity(year: number, month: number): Promise<ActivitySession[]> {
  const r = await getRoot();
  if (!r) return [];
  // Local-time month bounds, widened a day each side; the heatmap filters exactly.
  const start = new Date(year, month - 1, 0).toISOString();
  const end = new Date(year, month, 2).toISOString();
  const snap = await r.root
    .collection("companion")
    .where("started_at", ">=", start)
    .where("started_at", "<", end)
    .orderBy("started_at", "asc")
    .get();
  return snap.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      started_at: String(data.started_at ?? ""),
      message_count: typeof data.message_count === "number" ? data.message_count : 1,
    };
  });
}

export const artifactStore: Store = {
  saveChat,
  listChats,
  loadChat,
  saveNotes,
  listNotes,
  loadNote,
  saveCompanionSessionStart,
  setCompanionSessionCount,
  listCompanionActivity,
};
