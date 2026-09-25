import { useCallback, useEffect, useRef, useState } from "react";
import { dataUrlToBlob, type SampleFailure } from "@/lib/claude";
import type { Tier } from "@/lib/prompts";
import type { EffortMode, ModelId } from "@/lib/settings";
import { platform } from "@/platform";

// Same message shape the AI SDK's useChat used, so the original bubbles,
// thinking indicators and saved chats keep working unchanged.
export type TextPart = { type: "text"; text: string };
export type FilePart = { type: "file"; url: string; mediaType: string; filename?: string };
export type ReasoningPart = { type: "reasoning"; text: string };
export type MessagePart = TextPart | FilePart | ReasoningPart;
export type UIMessage = { id: string; role: "user" | "assistant"; parts: MessagePart[] };

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

import type { Turn } from "@/platform/types";

export type ChatRequest = {
  instructions: string;
  /** The claude.ai page's model tier. */
  modelTier: Tier;
  /** The picker's choices, for the standalone site's server. */
  model: ModelId;
  effort: EffortMode;
  /** Images Claude should see with the newest message (e.g. Companion photos). */
  extraImages?: Blob[];
};

const MAX_PROMPT_BYTES = 60_000;
const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function imagePartsOf(m: UIMessage): FilePart[] {
  return m.parts.filter(
    (p): p is FilePart => p.type === "file" && p.mediaType.startsWith("image/"),
  );
}

/**
 * The conversation as Claude reads it, newest last. Images ride with the
 * newest message only; earlier ones are described in text. The oldest turns
 * are dropped when the conversation outgrows one request, and it always
 * starts on the person's turn.
 */
export function buildTurns(history: UIMessage[]): { turns: Turn[]; images: Blob[] } {
  const last = history.length - 1;
  const turns: Turn[] = [];
  const images: Blob[] = [];

  history.forEach((m, i) => {
    const text = textOf(m);
    const pics = m.role === "user" ? imagePartsOf(m) : [];
    if (i === last) {
      for (const p of pics) {
        try {
          images.push(dataUrlToBlob(p.url));
        } catch {
          /* unreadable attachment: send the text alone */
        }
      }
      const note = images.length ? (text ? "" : "(Image attached.)") : "";
      turns.push({ role: m.role, content: text || note || "(Empty message.)" });
      return;
    }
    const earlier = pics.length ? `\n\n[${pics.length === 1 ? "An image was" : `${pics.length} images were`} attached here.]` : "";
    const content = `${text}${earlier}`.trim();
    if (content) turns.push({ role: m.role, content });
  });

  let total = turns.reduce((n, t) => n + bytes(t.content), 0);
  while ((total > MAX_PROMPT_BYTES || turns[0]?.role === "assistant") && turns.length > 1) {
    const dropped = turns.shift()!;
    total -= bytes(dropped.content);
  }
  return { turns, images };
}

/**
 * Drop-in for the AI SDK's useChat, backed by the claude.ai `sample`
 * capability: streams the reply into the last assistant message.
 * `sendMessage` rejects when the turn fails so the page can put the
 * viewer's text back in the composer, as the original did.
 */
export function useAceChat({
  id,
  request,
  onTierApplied,
}: {
  id: string;
  request: () => ChatRequest;
  onTierApplied?: (requested: Tier, applied: Tier) => void;
}) {
  const [messages, setMessagesState] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<SampleFailure | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const ctlRef = useRef<AbortController | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  const tierRef = useRef(onTierApplied);
  tierRef.current = onTierApplied;

  const commit = useCallback((next: UIMessage[]) => {
    messagesRef.current = next;
    setMessagesState(next);
  }, []);

  const setMessages = useCallback(
    (next: UIMessage[]) => {
      ctlRef.current?.abort();
      ctlRef.current = null;
      setStatus("ready");
      setError(null);
      commit(next);
    },
    [commit],
  );

  // A different chat id means a different conversation: stop the old reply.
  useEffect(() => {
    return () => {
      ctlRef.current?.abort();
      ctlRef.current = null;
    };
  }, [id]);

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async ({ parts }: { parts: MessagePart[] }) => {
      const userMsg: UIMessage = { id: newId(), role: "user", parts };
      const history = [...messagesRef.current, userMsg];
      commit(history);
      setError(null);
      setStatus("submitted");

      const ctl = new AbortController();
      ctlRef.current?.abort();
      ctlRef.current = ctl;
      const assistantId = newId();

      let reasoning = "";
      let answer = "";
      const putAssistant = (text: string) => {
        if (ctlRef.current !== ctl) return;
        answer = text;
        const parts: MessagePart[] = [];
        if (reasoning) parts.push({ type: "reasoning", text: reasoning });
        parts.push({ type: "text", text });
        commit([...history, { id: assistantId, role: "assistant", parts }]);
      };

      const req = requestRef.current();
      const { turns, images } = buildTurns(history);

      try {
        const result = await platform.chat(
          {
            instructions: req.instructions,
            turns,
            images: [...(req.extraImages ?? []), ...images],
            model: req.model,
            effort: req.effort,
            tier: req.modelTier,
          },
          {
            signal: ctl.signal,
            onText: (text) => {
              if (ctlRef.current !== ctl) return;
              setStatus("streaming");
              putAssistant(text);
            },
            onReasoning: (text) => {
              if (ctlRef.current !== ctl) return;
              reasoning = text;
              putAssistant(answer);
            },
          },
        );
        if (ctlRef.current !== ctl) return;
        putAssistant(result.text);
        ctlRef.current = null;
        setStatus("ready");
        if (result.tierApplied && result.tierApplied !== req.modelTier) {
          tierRef.current?.(req.modelTier, result.tierApplied);
        }
      } catch (e) {
        if (ctlRef.current !== ctl && !ctl.signal.aborted) return;
        const failure = (e ?? { code: "upstream_error" }) as SampleFailure;
        if (failure.code === "cancelled") {
          // Stopped by the viewer: keep whatever was written.
          if (failure.text) putAssistant(failure.text);
          if (ctlRef.current === ctl) ctlRef.current = null;
          setStatus("ready");
          return;
        }
        if (ctlRef.current !== ctl) return;
        ctlRef.current = null;
        commit(history.slice(0, -1));
        setError(failure);
        setStatus("error");
        throw failure;
      }
    },
    [commit],
  );

  return { messages, sendMessage, status, error, setMessages, stop };
}
