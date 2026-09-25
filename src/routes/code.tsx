import { useEffect, useRef, useState } from "react";
import { AppWindow, Check, Code2, Copy, Download, Eye, RotateCw } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Composer, ModeToggle, ModelMenu } from "@/components/Composer";
import { ChatMessage } from "@/components/ChatMessage";
import { EmptyState, Notice } from "@/components/Notice";
import { Markdown } from "@/components/Markdown";
import { messageText, reasoningText, ThinkingActivity } from "@/components/ai/AiResponseActivity";
import { AceMateOrb } from "@/components/ai/AceMateOrb";
import { useSettings, TEXT_SIZE_PX, type ModelId } from "@/lib/settings";
import { newId, useAceChat } from "@/lib/chat";
import { sampleErrorCopy } from "@/lib/claude";
import { IS_WEB, platform } from "@/platform";
import { chatInstructions, tierFor } from "@/lib/prompts";

const STARTERS = [
  "Build a landing page for a coffee shop",
  "Make a Pomodoro timer with start, pause, and reset",
  "Create a playable Snake game",
  "Build a to-do list that saves to localStorage",
];

type Segment = { kind: "text"; text: string } | { kind: "page"; code: string; complete: boolean };

/**
 * Split an answer into its words and the website it builds. A website is a
 * fenced ```html block; while it's still being written it has no closing
 * fence yet and counts as incomplete.
 */
function splitPages(text: string): Segment[] {
  const out: Segment[] = [];
  const open = /```[ \t]*html\b[^\n]*\n/gi;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text)) !== null) {
    if (m.index > pos) out.push({ kind: "text", text: text.slice(pos, m.index) });
    const start = m.index + m[0].length;
    const close = text.indexOf("```", start);
    if (close === -1) {
      out.push({ kind: "page", code: text.slice(start), complete: false });
      return out;
    }
    out.push({ kind: "page", code: text.slice(start, close), complete: true });
    pos = close + 3;
    open.lastIndex = pos;
  }
  if (pos < text.length) out.push({ kind: "text", text: text.slice(pos) });
  return out;
}

/** The last finished website in an answer. */
function latestPage(text: string): string | null {
  const pages = splitPages(text).filter((seg) => seg.kind === "page" && seg.complete);
  const last = pages.at(-1);
  return last && last.kind === "page" && last.code.trim() ? last.code.trim() : null;
}

function pageTitle(code: string): string | null {
  const m = /<title[^>]*>([^<]{1,80})<\/title>/i.exec(code);
  return m ? m[1].trim() || null : null;
}

const lineCount = (code: string) => code.split("\n").filter((l) => l.trim()).length;

/** A website in the conversation, shown as a card instead of its code. */
function PageCard({
  code,
  complete,
  active,
  onOpen,
}: {
  code: string;
  complete: boolean;
  active: boolean;
  onOpen: (view: "preview" | "code") => void;
}) {
  const lines = lineCount(code);
  const title = complete ? pageTitle(code) ?? "Your page" : "Building your page…";
  const detail = complete
    ? `${active ? "Showing in the preview" : "Website ready"} · ${lines} line${lines === 1 ? "" : "s"}`
    : `${lines} line${lines === 1 ? "" : "s"} written so far`;
  return (
    <div
      className={`glass flex w-full max-w-[560px] flex-wrap items-center gap-3 rounded-2xl px-3.5 py-3 transition-colors duration-200 ${
        active ? "border-[rgba(var(--accent-3-rgb),0.4)]" : ""
      }`}
    >
      <span className="quick-icon h-9 w-9 shrink-0">
        {complete ? (
          <AppWindow className="h-[18px] w-[18px]" strokeWidth={1.75} />
        ) : (
          <AceMateOrb activity="building" size={20} showLabel={false} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[var(--fg)]">{title}</span>
        <span className="block truncate text-[12.5px] text-[var(--fg-muted)]">{detail}</span>
      </span>
      {complete && (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen("preview")}
            className="chip inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px]"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            Preview
          </button>
          <button
            type="button"
            onClick={() => onOpen("code")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-[var(--fg-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          >
            <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Code
          </button>
        </span>
      )}
    </div>
  );
}

export function CodePage() {
  const [settings] = useSettings();
  const [sessionId, setSessionId] = useState(() => newId());
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelId>("aceUltra");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [html, setHtml] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [hasNewPreview, setHasNewPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thoughtDurations, setThoughtDurations] = useState<Record<string, number>>({});

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<ModelId>(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const { messages, sendMessage, status, error, setMessages, stop } = useAceChat({
    id: sessionId,
    request: () => ({
      instructions: chatInstructions({
        responseStyle: "balanced",
        effort: "balanced",
        codeMode: true,
        codePreview: true,
      }),
      modelTier: tierFor(modelRef.current, "balanced"),
      model: modelRef.current,
      effort: "balanced",
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const currentAssistant = messages.at(-1)?.role === "assistant" ? messages.at(-1) : undefined;
  const currentText = currentAssistant ? messageText(currentAssistant.parts) : "";
  const currentReasoning = currentAssistant ? reasoningText(currentAssistant.parts) : "";
  const isThinking = isLoading && !currentText;
  const currentSegments = splitPages(currentText);
  const lastSegment = currentSegments.at(-1);
  const isBuildingHtml = status === "streaming" && lastSegment?.kind === "page" && !lastSegment.complete;

  useEffect(() => {
    if (!thinkingStartedAt || !currentAssistant || !currentText) return;
    setThoughtDurations((durations) =>
      durations[currentAssistant.id]
        ? durations
        : { ...durations, [currentAssistant.id]: Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000)) },
    );
    setThinkingStartedAt(null);
  }, [currentAssistant, currentText, thinkingStartedAt]);

  useEffect(() => {
    if (error || (!isLoading && thinkingStartedAt)) setThinkingStartedAt(null);
  }, [error, isLoading, thinkingStartedAt]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  // A newly finished website in the latest answer goes straight to the preview.
  const latestRef = useRef<string | null>(null);
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const found = latestPage(messageText(lastAssistant.parts));
    if (found && found !== latestRef.current) {
      latestRef.current = found;
      setHtml(found);
      setPreviewKey((k) => k + 1);
      setHasNewPreview(true);
    }
  }, [messages]);

  /** Show one website from the conversation in the side panel. */
  const openPage = (code: string, view: "preview" | "code") => {
    const next = code.trim();
    if (next !== html) {
      setHtml(next);
      setPreviewKey((k) => k + 1);
    }
    setTab(view);
    setMobileView("preview");
    setHasNewPreview(false);
  };

  // Answers show their words; each website appears as a card, not code.
  const renderBody = (text: string, writing: boolean) => {
    const segments = splitPages(text);
    return (
      <div className="flex flex-col gap-3">
        {segments.map((seg, i) => {
          if (seg.kind === "page") {
            return (
              <PageCard
                key={i}
                code={seg.code}
                complete={seg.complete}
                active={seg.complete && seg.code.trim() === html}
                onOpen={(view) => openPage(seg.code, view)}
              />
            );
          }
          // Hide a code fence that's only half written so far.
          const words = writing && i === segments.length - 1 ? seg.text.replace(/`{1,3}[^`\n]*$/, "") : seg.text;
          return words.trim() ? <Markdown key={i} text={words} /> : null;
        })}
      </div>
    );
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    const snapshot = input;
    setInput("");
    setThinkingStartedAt(Date.now());
    sendMessage({ parts: [{ type: "text", text: trimmed }] }).catch(() => {
      setThinkingStartedAt(null);
      setInput(snapshot);
    });
  };

  const onNewSession = () => {
    setMessages([]);
    setSessionId(newId());
    setInput("");
    setThinkingStartedAt(null);
    setThoughtDurations({});
    setHtml(null);
    latestRef.current = null;
    setHasNewPreview(false);
    setMobileView("chat");
    setSaveNote(null);
  };

  const onCopy = () => {
    if (!html) return;
    navigator.clipboard
      .writeText(html)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        setTab("code");
        setSaveNote("Copying is blocked here. Select the code and copy it instead.");
      });
  };

  const onDownload = async () => {
    if (!html) return;
    setSaveNote(null);
    const outcome = await platform.download("acemate-site.html", html);
    if (outcome === "unavailable") setSaveNote("Downloads aren't available here. Use Copy instead.");
  };

  const showEmpty = messages.length === 0;
  const canSend = !!input.trim() && !isLoading;

  const conversationPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollerRef} className="scrollbar-thin thread-fade min-h-0 flex-1 overflow-y-auto">
        {showEmpty ? (
          <div className="mx-auto flex min-h-full w-full max-w-[600px] flex-col items-center justify-center px-5 py-10 text-center">
            <AceMateOrb activity="idle" size={44} showLabel={false} label="Ready to build" />
            <h1 className="font-display mt-8 text-[26px] font-semibold leading-tight text-[var(--fg)] sm:text-[32px]">
              What should we build?
            </h1>
            <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
              Describe a page, app or game. It renders live next to the chat.
            </p>
            <ul className="glass mt-8 w-full overflow-hidden rounded-[18px] text-left">
              {STARTERS.map((s, i) => (
                <li key={s} className={i ? "border-t border-[var(--line)]" : ""}>
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="w-full px-4 py-3 text-left text-[14px] text-[var(--fg)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div
            className="thread mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-8 pt-3 sm:px-5"
            style={{ fontSize: TEXT_SIZE_PX[settings.textSize] }}
          >
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                thoughtSeconds={thoughtDurations[m.id]}
                writing={status === "streaming" && currentAssistant?.id === m.id && Boolean(currentText)}
                renderBody={renderBody}
              />
            ))}
            {isThinking && thinkingStartedAt && (
              <ThinkingActivity startedAt={thinkingStartedAt} reasoning={currentReasoning} />
            )}
            {error && <Notice>{sampleErrorCopy(error, "Something went wrong. Try again.")}</Notice>}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto w-full max-w-[760px]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submit(input)}
            onStop={stop}
            busy={isLoading}
            canSend={canSend}
            placeholder={showEmpty ? "Describe what to build…" : "Ask for a change…"}
            inputRef={inputRef}
            voice={IS_WEB}
            trailing={<ModelMenu model={model} onModel={setModel} />}
          />
          <p className="pt-2 text-center text-[11.5px] text-[var(--fg-faint)]">
            AceMate can make mistakes. Check the page before you share it.
          </p>
        </div>
      </div>
    </div>
  );

  const previewPane = (
    <div className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-2.5 py-2">
        <ModeToggle
          value={tab}
          options={[
            { value: "preview", label: "Preview" },
            { value: "code", label: "Code" },
          ]}
          onChange={setTab}
        />
        <div className="flex items-center gap-0.5">
          <PanelButton label={copied ? "Copied" : "Copy"} onClick={onCopy} disabled={!html}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </PanelButton>
          <PanelButton label="Download" onClick={() => void onDownload()} disabled={!html}>
            <Download className="h-4 w-4" />
          </PanelButton>
          <PanelButton label="Refresh" onClick={() => setPreviewKey((k) => k + 1)} disabled={!html}>
            <RotateCw className="h-4 w-4" />
          </PanelButton>
        </div>
      </div>
      {saveNote && (
        <div className="border-b border-[var(--line)] px-3.5 py-2 text-[12.5px] text-[var(--fg-muted)]">
          {saveNote}
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {isBuildingHtml ? (
          <div className="flex h-full items-center justify-center">
            <AceMateOrb activity="building" size={56} centered />
          </div>
        ) : !html ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState title="Nothing built yet." subtitle="Ask for a page, app or game and it will appear here." />
          </div>
        ) : tab === "preview" ? (
          <iframe
            key={previewKey}
            title="Live preview"
            srcDoc={html}
            sandbox="allow-scripts allow-forms allow-modals"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <pre className="scrollbar-thin h-full overflow-auto bg-[var(--pre-bg)] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--fg)]">
            <code className="whitespace-pre">{html}</code>
          </pre>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="Code"
        trailing={
          <button
            type="button"
            onClick={onNewSession}
            className="chip h-8 rounded-full px-3.5 text-[13px]"
          >
            New session
          </button>
        }
      />

      {/* Phone: switch between the conversation and the preview */}
      <div className="flex justify-center px-4 pb-2 md:hidden">
        <div className="relative">
          <ModeToggle
            value={mobileView}
            options={[
              { value: "chat", label: "Chat" },
              { value: "preview", label: "Preview" },
            ]}
            onChange={(v) => {
              setMobileView(v);
              if (v === "preview") setHasNewPreview(false);
            }}
          />
          {hasNewPreview && mobileView !== "preview" && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent-2)] shadow-[0_0_8px_var(--accent-2)]" aria-label="New preview" />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 md:gap-2 md:pb-3 md:pr-3">
        <div className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${mobileView === "chat" ? "flex" : "hidden"}`}>
          {conversationPane}
        </div>
        <div className={`min-h-0 min-w-0 flex-1 flex-col p-3 md:flex md:p-0 ${mobileView === "preview" ? "flex" : "hidden"}`}>
          {previewPane}
        </div>
      </div>
    </div>
  );
}

function PanelButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-[var(--fg-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] disabled:opacity-35"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
