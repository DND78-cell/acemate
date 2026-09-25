import { useEffect, useState } from "react";
import type { UIMessage } from "@/lib/chat";

/**
 * Shared state between the sidebar and the chat screen: "New chat" and
 * Recents requests, which chat is open, and the open conversation itself,
 * so leaving for Settings or Notes and coming back keeps it on screen.
 */

export type ChatRequest = { type: "new" } | { type: "open"; id: string };

type Snapshot = { chatId: string; messages: UIMessage[]; title: string };

let pending: ChatRequest | null = null;
let current: Snapshot | null = null;
let recentsVersion = 0;
const requestListeners = new Set<() => void>();
const stateListeners = new Set<() => void>();

function notify(set: Set<() => void>) {
  set.forEach((fn) => fn());
}

export function requestChat(req: ChatRequest) {
  pending = req;
  notify(requestListeners);
}

export function takeChatRequest(): ChatRequest | null {
  const req = pending;
  pending = null;
  return req;
}

export function onChatRequest(fn: () => void): () => void {
  requestListeners.add(fn);
  return () => requestListeners.delete(fn);
}

export function rememberChat(snapshot: Snapshot) {
  const changed =
    current?.chatId !== snapshot.chatId || current?.title !== snapshot.title;
  current = snapshot;
  if (changed) notify(stateListeners);
}

export function currentChat(): Snapshot | null {
  return current;
}

export function forgetChat() {
  current = null;
  notify(stateListeners);
}

/** Saved chats changed: the sidebar reloads Recents. */
export function bumpRecents() {
  recentsVersion += 1;
  notify(stateListeners);
}

export function useChatNavState() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    stateListeners.add(fn);
    return () => {
      stateListeners.delete(fn);
    };
  }, []);
  return {
    activeChatId: current?.chatId ?? null,
    activeTitle: current?.title ?? "",
    recentsVersion,
  };
}
