import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { UIMessage } from "@/lib/chat";
import { Markdown, useCopy } from "@/components/Markdown";
import { reasoningText, ThoughtDisclosure } from "@/components/ai/AiResponseActivity";
import { AceMateOrb } from "@/components/ai/AceMateOrb";
import { AceMateLogo } from "@/components/AceMateLogo";

/**
 * One turn of a conversation. The person's messages are light and compact
 * on the right; AceMate's answers are the main content: a small header,
 * then the answer with full typographic hierarchy.
 */
export function ChatMessage({
  message,
  thoughtSeconds,
  writing,
  renderBody,
}: {
  message: UIMessage;
  thoughtSeconds?: number;
  writing: boolean;
  /** Draw an answer's text another way (the Code screen hides website code). */
  renderBody?: (text: string, writing: boolean) => ReactNode;
}) {
  const [copied, copy] = useCopy();
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

  if (message.role === "user") {
    const images = message.parts.flatMap((p) =>
      p.type === "file" && p.mediaType.startsWith("image/") ? [p.url] : [],
    );
    return (
      <div className="user-turn msg-in flex flex-col items-end gap-2">
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt="Attached image"
            className="max-h-[240px] max-w-[70%] rounded-2xl border border-[var(--line)] object-cover"
          />
        ))}
        {text && <div className="user-msg">{text}</div>}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="msg-in group flex flex-col items-start">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-[var(--fg-muted)]">
        <AceMateLogo size={18} />
        AceMate
      </div>
      {thoughtSeconds != null && (
        <ThoughtDisclosure seconds={thoughtSeconds} reasoning={reasoningText(message.parts)} />
      )}
      <div className="w-full text-[var(--fg)]">{renderBody ? renderBody(text, writing) : <Markdown text={text} />}</div>
      {writing ? (
        <AceMateOrb activity="writing" size={16} showLabel={false} className="pt-3" />
      ) : (
        <div className="mt-2 flex h-8 items-center">
          <button
            type="button"
            onClick={() => copy(text)}
            aria-label={copied ? "Copied" : "Copy answer"}
            title={copied ? "Copied" : "Copy"}
            className="round-btn -ml-2 h-8 w-8 text-[var(--fg-faint)]"
          >
            {copied ? <Check className="h-4 w-4 text-[var(--success)]" /> : <Copy className="h-4 w-4" strokeWidth={1.6} />}
          </button>
        </div>
      )}
    </div>
  );
}
