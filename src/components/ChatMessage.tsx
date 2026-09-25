import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { UIMessage } from "@/lib/chat";
import { Markdown, useCopy } from "@/components/Markdown";
import { reasoningText, ThoughtDisclosure } from "@/components/ai/AiResponseActivity";
import { AceMateOrb } from "@/components/ai/AceMateOrb";

/**
 * One turn of a conversation. The person's messages sit in a bubble on the
 * right; AceMate's answers read as plain text across the column.
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
      <div className="flex flex-col items-end gap-2">
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt="Attached image"
            className="max-h-[260px] max-w-[70%] rounded-2xl border border-[var(--line)] object-cover"
          />
        ))}
        {text && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-[var(--bubble)] px-4 py-2.5 leading-relaxed text-[var(--fg)] sm:max-w-[75%]">
            {text}
          </div>
        )}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="group flex flex-col items-start">
      {thoughtSeconds != null && (
        <ThoughtDisclosure seconds={thoughtSeconds} reasoning={reasoningText(message.parts)} />
      )}
      <div className="w-full text-[var(--fg)]">
        {renderBody ? renderBody(text, writing) : <Markdown text={text} />}
      </div>
      {writing ? (
        <AceMateOrb activity="writing" size={20} showLabel={false} className="pt-2" />
      ) : (
        <div className="mt-1.5 flex h-8 items-center">
          <button
            type="button"
            onClick={() => copy(text)}
            aria-label={copied ? "Copied" : "Copy answer"}
            title={copied ? "Copied" : "Copy"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fg-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
