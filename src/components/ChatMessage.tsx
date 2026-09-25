import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { UIMessage } from "@/lib/chat";
import { Markdown, useCopy } from "@/components/Markdown";
import { reasoningText, ThoughtDisclosure } from "@/components/ai/AiResponseActivity";
import { AceMateOrb } from "@/components/ai/AceMateOrb";
import { useGridSnap } from "@/lib/use-grid-snap";

/** Questions longer than this read as a pasted passage and switch to print. */
const LONG_QUESTION = 240;

/**
 * One turn of a conversation, laid out in an exercise book. The person's
 * question is handwritten on the ruled lines with its number in the margin;
 * AceMate's answer is a printed sheet taped onto the page, marked "Ans.".
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
  const isUser = message.role === "user";
  // Skip a line after a question, and at least one after an answer sheet.
  const snapRef = useGridSnap(isUser ? 14 : 28);
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

  if (isUser) {
    const images = message.parts.flatMap((p) =>
      p.type === "file" && p.mediaType.startsWith("image/") ? [p.url] : [],
    );
    return (
      <div ref={snapRef} className="relative flex flex-col items-start gap-[14px]">
        {number != null && <span className="margin-note">Q{number}.</span>}
        {text && <div className={`question ${text.length > LONG_QUESTION ? "is-long" : ""}`}>{text}</div>}
        {images.map((url, i) => (
          <img key={i} src={url} alt="Attached image" className="question-photo" />
        ))}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div ref={snapRef} className="answer-sheet group">
      <span className="margin-note" style={{ top: 9 }} aria-hidden="true">
        Ans.
      </span>
      {thoughtSeconds != null && (
        <ThoughtDisclosure seconds={thoughtSeconds} reasoning={reasoningText(message.parts)} />
      )}
      <div className="w-full">{renderBody ? renderBody(text, writing) : <Markdown text={text} />}</div>
      {writing ? (
        <AceMateOrb activity="writing" size={20} showLabel={false} className="py-2" />
      ) : (
        <div className="mt-1 flex h-8 items-center">
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
