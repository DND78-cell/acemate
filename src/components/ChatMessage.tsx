import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { UIMessage } from "@/lib/chat";
import { Markdown, useCopy } from "@/components/Markdown";
import { reasoningText, ThoughtDisclosure } from "@/components/ai/AiResponseActivity";
import { AceMateOrb } from "@/components/ai/AceMateOrb";

/** Questions longer than this read as a pasted passage, not a heading. */
const LONG_QUESTION = 240;

/**
 * One turn of a conversation, laid out like an exercise book: the person's
 * question is written as a numbered heading (the number sits in the page
 * margin), and AceMate's answer follows it, marked "Ans".
 */
export function ChatMessage({
  message,
  number,
  thoughtSeconds,
  writing,
  renderBody,
}: {
  message: UIMessage;
  /** The question's number in this conversation (person's turns only). */
  number?: number;
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
      <div className="relative flex flex-col items-start gap-3 pt-2 not-first:mt-7">
        {number != null && (
          <span className="margin-note" style={{ top: "0.5rem" }}>
            Q{number}
          </span>
        )}
        {text && <div className={`question ${text.length > LONG_QUESTION ? "is-long" : ""}`}>{text}</div>}
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt="Attached image"
            className="max-h-[240px] max-w-full rounded-xl border border-[var(--line)] object-cover sm:max-w-[70%]"
          />
        ))}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="group flex flex-col items-start">
      {thoughtSeconds != null && (
        <ThoughtDisclosure seconds={thoughtSeconds} reasoning={reasoningText(message.parts)} />
      )}
      <div className="relative w-full text-[var(--fg)]">
        <span className="margin-note is-answer" style={{ lineHeight: "1.6rem" }} aria-hidden="true">
          Ans
        </span>
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
            className="-ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fg-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

/** Numbers each of the person's messages 1, 2, 3… in conversation order. */
export function questionNumbers(messages: UIMessage[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const m of messages) if (m.role === "user") numbers.set(m.id, ++n);
  return numbers;
}
