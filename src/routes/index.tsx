import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Code2, GraduationCap, PenLine, Plus, ScanText, X, type LucideIcon } from "lucide-react";
import { AceMateLogo } from "@/components/AceMateLogo";
import { useShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { Composer, ModeToggle, ModelMenu } from "@/components/Composer";
import { UsageMenu } from "@/components/UsageMenu";
import { CornerButton } from "@/components/ui/corner-button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/ChatMessage";
import { messageText, reasoningText, ThinkingActivity } from "@/components/ai/AiResponseActivity";
import { saveChat, loadChat } from "@/lib/persistence";
import { contextUse, newId, useAceChat, type MessagePart, type UIMessage } from "@/lib/chat";
import { currentChat, onChatRequest, rememberChat, takeChatRequest, type ChatRequest } from "@/lib/chat-nav";
import { sampleErrorCopy } from "@/lib/claude";
import { pickThought } from "@/lib/thoughts";
import { getImageLimits } from "@/platform";
import type { ImageLimits } from "@/platform/types";
import { chatInstructions, tierFor } from "@/lib/prompts";
import {
  useSettings,
  TEXT_SIZE_PX,
  consumeClearConversation,
  modelLabel,
  type ModelId,
  type EffortMode,
} from "@/lib/settings";

type Starter = {
  key: string;
  label: string;
  icon: LucideIcon;
  prompts?: string[];
  to?: "/notes" | "/companion";
};

const STARTERS: Starter[] = [
  {
    key: "write",
    label: "Write",
    icon: PenLine,
    prompts: [
      "Write a birthday message for my friend",
      "Draft a polite follow-up email to my teacher",
      "Help me write the opening of a short story",
    ],
  },
  {
    key: "learn",
    label: "Learn",
    icon: GraduationCap,
    prompts: [
      "Explain black holes simply",
      "Quiz me on world capitals",
      "Explain photosynthesis step by step",
    ],
  },
  {
    key: "code",
    label: "Code",
    icon: Code2,
    prompts: [
      "Help me fix a Python error",
      "Explain what a REST API is, with an example",
      "Write a function that checks whether a word is a palindrome",
    ],
  },
  { key: "notes", label: "Chapter notes", icon: ScanText, to: "/notes" },
  { key: "study", label: "Study companion", icon: BookOpen, to: "/companion" },
];

/** Starter buttons take the theme's own main color instead of neon yellow. */
const STARTER_ACCENT: Record<string, string> = {
  graphite: "#ececec",
  ocean: "#e6eef7",
  warm: "#f0ebe5",
  light: "#e2e2df",
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
type Attachment = { file: File; dataUrl: string; previewUrl: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

function titleOf(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.find((p) => p.type === "text");
  const t = text && text.type === "text" ? text.text.trim() : "";
  if (!t) return messages.length ? "New chat" : "";
  return t.length > 60 ? `${t.slice(0, 60).trim()}…` : t;
}

export function ChatPage() {
  const shell = useShell();
  const navigate = useNavigate();
  const [thought, setThought] = useState(() => pickThought());
  const [chatId, setChatId] = useState<string>(() => newId());
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [settings, updateSettings] = useSettings();
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [imageLimits, setImageLimits] = useState<ImageLimits | null>(null);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thoughtDurations, setThoughtDurations] = useState<Record<string, number>>({});
  const [openStarter, setOpenStarter] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipSaveRef = useRef(false);

  const responseStyleRef = useRef(settings.responseStyle);
  const modelRef = useRef<ModelId>(settings.model);
  const effortRef = useRef<EffortMode>(settings.effort);
  const codeModeRef = useRef<boolean>(settings.codeMode);
  useEffect(() => {
    responseStyleRef.current = settings.responseStyle;
  }, [settings.responseStyle]);
  useEffect(() => {
    modelRef.current = settings.model;
  }, [settings.model]);
  useEffect(() => {
    effortRef.current = settings.effort;
  }, [settings.effort]);
  useEffect(() => {
    codeModeRef.current = settings.codeMode;
  }, [settings.codeMode]);

  const { messages, sendMessage, status, error, setMessages, stop } = useAceChat({
    id: chatId,
    request: () => ({
      instructions: chatInstructions({
        responseStyle: responseStyleRef.current,
        effort: effortRef.current,
        codeMode: codeModeRef.current,
      }),
      modelTier: tierFor(modelRef.current, effortRef.current),
      model: modelRef.current,
      effort: effortRef.current,
    }),
    onTierApplied: (requested) => {
      if (requested === "complex") {
        setFallbackNotice("Your plan doesn't include Ace Ultra 4.8's model, so a lighter model answered.");
      }
    },
  });

  useEffect(() => {
    let active = true;
    void getImageLimits().then((limits) => {
      if (active) setImageLimits(limits);
    });
    return () => {
      active = false;
    };
  }, []);

  const isLoading = status === "submitted" || status === "streaming";
  const currentAssistant = messages.at(-1)?.role === "assistant" ? messages.at(-1) : undefined;
  const currentText = currentAssistant ? messageText(currentAssistant.parts) : "";
  const currentReasoning = currentAssistant ? reasoningText(currentAssistant.parts) : "";
  const isThinking = isLoading && !currentText;

  useEffect(() => {
    if (!thinkingStartedAt || !currentAssistant || !currentText) return;
    setThoughtDurations((durations) =>
      durations[currentAssistant.id]
        ? durations
        : {
            ...durations,
            [currentAssistant.id]: Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000)),
          },
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

  useEffect(() => {
    if (shell.isDesktop) inputRef.current?.focus();
  }, [chatId, isLoading, shell.isDesktop]);

  // If Ace Ultra errors, fall back to Ace One with an inline notice.
  useEffect(() => {
    if (error && modelRef.current !== "aceOne" && (error.code === "upstream_error" || error.code === "empty_completion")) {
      const prev = modelLabel(modelRef.current);
      updateSettings({ model: "aceOne" });
      setFallbackNotice(`${prev} was unavailable. Switched to Ace One 4.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Keep the open conversation (and its title) available to the sidebar and
  // to this screen when it's opened again.
  useEffect(() => {
    rememberChat({ chatId, messages, title: titleOf(messages) });
  }, [chatId, messages]);

  // Auto-save the conversation once a turn finishes (signed in only; no-op as a guest).
  useEffect(() => {
    if (isLoading || messages.length === 0) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    void saveChat(chatId, messages);
  }, [chatId, messages, isLoading]);

  const clearAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setAttachError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const startNewChat = () => {
    setMessages([]);
    setChatId(newId());
    setInput("");
    setThinkingStartedAt(null);
    setThoughtDurations({});
    setFallbackNotice(null);
    setOpenStarter(null);
    setThought((current) => pickThought(current));
    clearAttachment();
  };

  const openSavedChat = async (id: string) => {
    const loaded = await loadChat(id);
    if (!loaded) return;
    skipSaveRef.current = true;
    setChatId(id);
    setMessages(loaded);
    setInput("");
    setThoughtDurations({});
    setFallbackNotice(null);
    clearAttachment();
  };

  const handleRequest = (req: ChatRequest | null) => {
    if (!req) return;
    if (req.type === "new") startNewChat();
    else void openSavedChat(req.id);
  };

  // On arrival: a pending sidebar request wins, then Settings' "Clear
  // conversation", then whatever chat was open before.
  useEffect(() => {
    const req = takeChatRequest();
    if (req) handleRequest(req);
    else if (consumeClearConversation()) startNewChat();
    else {
      const prev = currentChat();
      if (prev && prev.messages.length) {
        skipSaveRef.current = true;
        setChatId(prev.chatId);
        setMessages(prev.messages);
      }
    }
    return onChatRequest(() => handleRequest(takeChatRequest()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachError(null);
    if (!file.type.startsWith("image/")) {
      setAttachError("Please choose an image file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (imageLimits && !imageLimits.mediaTypes.includes(file.type)) {
      setAttachError("Please choose a JPEG, PNG, WebP or GIF image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > Math.min(MAX_IMAGE_BYTES, imageLimits?.maxInputBytes ?? MAX_IMAGE_BYTES)) {
      setAttachError("That image is over 8 MB — try a smaller one.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment({ file, dataUrl, previewUrl: URL.createObjectURL(file) });
    } catch {
      setAttachError("Couldn't read that image. Try another one.");
    }
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || isLoading) return;

    const parts: MessagePart[] = [];
    if (trimmed) parts.push({ type: "text", text: trimmed });
    if (attachment) {
      parts.push({
        type: "file",
        url: attachment.dataUrl,
        mediaType: attachment.file.type,
        filename: attachment.file.name,
      });
    }

    const snapshotText = input;
    const snapshotAttachment = attachment;

    setInput("");
    setOpenStarter(null);
    setThinkingStartedAt(Date.now());
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";

    sendMessage({ parts }).catch(() => {
      setThinkingStartedAt(null);
      setInput(snapshotText);
      setAttachment(snapshotAttachment);
    });
  };

  const showEmpty = messages.length === 0;
  const canSend = (!!input.trim() || !!attachment) && !isLoading;

  const notices = (
    <>
      {error && (
        <div className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13.5px] text-[var(--fg)]">
          {sampleErrorCopy(error, "Something went wrong. Your message is still in the box — try again.")}
        </div>
      )}
      {fallbackNotice && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--fg-muted)]">
          {fallbackNotice}
        </div>
      )}
    </>
  );

  const composer = (placement: "up" | "down") => (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={imageLimits?.mediaTypes.join(",") || "image/*"}
        className="hidden"
        onChange={onFileChosen}
      />
      {attachError && (
        <div className="mb-2 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-3.5 py-2 text-[13px] text-[var(--fg)]">
          {attachError}
        </div>
      )}
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => submit(input)}
        onStop={stop}
        busy={isLoading}
        canSend={canSend}
        placeholder={showEmpty ? "How can I help you today?" : "Reply to AceMate…"}
        inputRef={inputRef}
        top={
          attachment && (
            <div className="mb-2 flex">
              <div className="relative">
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  className="h-14 w-14 rounded-xl border border-[var(--line)] object-cover"
                />
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Remove image"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary-bg)] text-[var(--primary-fg)]"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )
        }
        leading={
          <>
            {imageLimits && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add an image"
                title="Add an image"
                disabled={isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] disabled:opacity-40"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
            <ModeToggle
              value={settings.codeMode ? "code" : "chat"}
              options={[
                { value: "chat", label: "Chat" },
                { value: "code", label: "Code" },
              ]}
              onChange={(v) => updateSettings({ codeMode: v === "code" })}
            />
          </>
        }
        trailing={
          <>
            <ModelMenu
              model={settings.model}
              onModel={(v) => updateSettings({ model: v })}
              effort={settings.effort}
              onEffort={(v) => updateSettings({ effort: v })}
              placement={placement}
            />
            <UsageMenu context={contextUse(messages)} placement={placement} />
          </>
        }
      />
    </>
  );

  const openStarterDef = STARTERS.find((s) => s.key === openStarter);
  const starters = (
    <div className="mt-4">
      <div className="flex flex-wrap justify-center">
        {STARTERS.map((s) => {
          const Icon = s.icon;
          const active = s.key === openStarter;
          return (
            <CornerButton
              key={s.key}
              type="button"
              accentColor={STARTER_ACCENT[settings.theme] ?? STARTER_ACCENT.graphite}
              icon={<Icon className="corner-btn-icon" strokeWidth={1.75} aria-hidden="true" />}
              wrapperClassName={cn("corner-compact", active && "corner-active")}
              aria-expanded={s.prompts ? active : undefined}
              onClick={() => {
                if (s.to) void navigate({ to: s.to });
                else setOpenStarter(active ? null : s.key);
              }}
            >
              {s.label}
            </CornerButton>
          );
        })}
      </div>
      {openStarterDef?.prompts && (
        <ul className="mt-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {openStarterDef.prompts.map((p, i) => (
            <li key={p} className={i ? "border-t border-[var(--line)]" : ""}>
              <button
                type="button"
                onClick={() => submit(p)}
                className="w-full px-4 py-3 text-left text-[14px] text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const heading = (
    <h1 className="font-serif text-balance text-center text-[32px] font-normal leading-tight text-[var(--fg)] sm:text-[40px]">
      {/* In the line, so it stays with the first words when a thought wraps. */}
      <AceMateLogo size={shell.isDesktop ? 34 : 28} className="mr-3 inline-block align-[-0.15em]" />
      {thought}
    </h1>
  );

  if (showEmpty) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        {shell.isDesktop ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[12vh]">
            <div className="w-full max-w-[680px]">
              <div className="mb-8">{heading}</div>
              <div className="mb-3 flex flex-col gap-2 empty:hidden">{notices}</div>
              {composer("down")}
              {starters}
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4">
              <div className="w-full">
                {heading}
                {starters}
              </div>
            </div>
            <div className="shrink-0 px-3 pb-3">
              <div className="mb-2 flex flex-col gap-2 empty:hidden">{notices}</div>
              {composer("up")}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title={titleOf(messages)} />
      <div ref={scrollerRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto flex max-w-[736px] flex-col gap-6 px-4 pb-8 pt-4 sm:px-6"
          style={{ fontSize: TEXT_SIZE_PX[settings.textSize] }}
        >
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              thoughtSeconds={thoughtDurations[m.id]}
              writing={status === "streaming" && currentAssistant?.id === m.id && Boolean(currentText)}
            />
          ))}
          {isThinking && thinkingStartedAt && (
            <ThinkingActivity startedAt={thinkingStartedAt} reasoning={currentReasoning} />
          )}
          <div className="flex flex-col gap-2 empty:hidden">{notices}</div>
        </div>
      </div>
      <div className="shrink-0 px-3 pb-2 sm:px-4">
        <div className="mx-auto max-w-[736px]">
          {composer("up")}
          <p className="py-2 text-center text-[11.5px] text-[var(--fg-faint)]">
            AceMate can make mistakes — double-check important answers.
          </p>
        </div>
      </div>
    </div>
  );
}
