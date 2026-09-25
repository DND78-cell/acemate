import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Brain, NotebookPen, Paperclip, Target, X, Zap, type LucideIcon } from "lucide-react";
import { useShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { Composer, ModeToggle, ModelMenu } from "@/components/Composer";
import { ChatMessage } from "@/components/ChatMessage";
import { Notice } from "@/components/Notice";
import { AceMateOrb } from "@/components/ai/AceMateOrb";
import { messageText, reasoningText, ThinkingActivity } from "@/components/ai/AiResponseActivity";
import { useAuth } from "@/hooks/use-auth";
import { saveChat, loadChat } from "@/lib/persistence";
import { newId, useAceChat, type MessagePart, type UIMessage } from "@/lib/chat";
import { currentChat, onChatRequest, rememberChat, takeChatRequest, type ChatRequest } from "@/lib/chat-nav";
import { sampleErrorCopy } from "@/lib/claude";
import { getImageLimits, IS_WEB } from "@/platform";
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

type QuickAction = {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  prompts?: string[];
  to?: "/notes" | "/companion";
};

const QUICK_ACTIONS: QuickAction[] = [
  { key: "study", label: "Study", desc: "Work through your own notes", icon: BookOpen, to: "/companion" },
  {
    key: "explain",
    label: "Explain",
    desc: "Understand any topic simply",
    icon: Brain,
    prompts: [
      "Explain black holes simply",
      "Explain photosynthesis step by step",
      "Explain Newton's three laws with everyday examples",
    ],
  },
  { key: "notes", label: "Make notes", desc: "Chapter photos to notes", icon: NotebookPen, to: "/notes" },
  {
    key: "quiz",
    label: "Quiz me",
    desc: "Test yourself in minutes",
    icon: Zap,
    prompts: [
      "Quiz me on world capitals",
      "Give me 5 multiple-choice questions on the French Revolution",
      "Test me on the first 20 elements of the periodic table",
    ],
  },
  {
    key: "plan",
    label: "Study plan",
    desc: "Plan your revision week",
    icon: Target,
    prompts: [
      "Make me a 7-day study plan for my physics exam",
      "Plan my revision for 3 subjects over the next 2 weeks",
      "Build a daily study timetable around school hours",
    ],
  },
];

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

function greeting(name: string): string {
  const h = new Date().getHours();
  // Website accounts are named by email; greet them by the part before the @.
  const raw = name.includes("@") ? name.split("@")[0] : (name.trim().split(/\s+/)[0] ?? "");
  const first = name.includes("@") ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
  if (h >= 22 || h < 5) return first ? `Still up, ${first}?` : "Still up?";
  const base = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return first ? `${base}, ${first}` : base;
}

export function ChatPage() {
  const shell = useShell();
  const navigate = useNavigate();
  const { user } = useAuth();
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
        <Notice>{sampleErrorCopy(error, "Something went wrong. Your message is still in the box, so you can try again.")}</Notice>
      )}
      {fallbackNotice && <Notice tone="info">{fallbackNotice}</Notice>}
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
        <Notice className="mb-2">{attachError}</Notice>
      )}
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => submit(input)}
        onStop={stop}
        busy={isLoading}
        canSend={canSend}
        placeholder={showEmpty ? "Ask AceMate…" : "Ask a follow-up…"}
        inputRef={inputRef}
        voice={IS_WEB}
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
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--surface)] text-[var(--fg)] shadow-[0_0_0_1px_var(--line-strong)]"
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
                aria-label="Attach an image"
                title="Attach an image"
                disabled={isLoading}
                className="round-btn"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.6} />
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
          <ModelMenu
            model={settings.model}
            onModel={(v) => updateSettings({ model: v })}
            effort={settings.effort}
            onEffort={(v) => updateSettings({ effort: v })}
            placement={placement}
          />
        }
      />
    </>
  );

  const openAction = QUICK_ACTIONS.find((a) => a.key === openStarter);
  const quickActions = (
    <div className="w-full">
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          const active = a.key === openStarter;
          return (
            <button
              key={a.key}
              type="button"
              className="quick-card last:col-span-2 max-sm:flex-row max-sm:items-center max-sm:gap-3 max-sm:p-3 sm:last:col-span-1"
              aria-expanded={a.prompts ? active : undefined}
              onClick={() => {
                if (a.to) void navigate({ to: a.to });
                else setOpenStarter(active ? null : a.key);
              }}
            >
              <span className="quick-icon">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-medium text-[var(--fg)]">{a.label}</span>
                <span className="hidden text-[12.5px] leading-snug text-[var(--fg-muted)] sm:block">{a.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {openAction?.prompts && (
        <ul key={openAction.key} className="glass msg-in mt-3 overflow-hidden rounded-[18px] text-left">
          {openAction.prompts.map((p, i) => (
            <li key={p} className={i ? "border-t border-[var(--line)]" : ""}>
              <button
                type="button"
                onClick={() => submit(p)}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[var(--fg)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
              >
                <span className="flex-1">{p}</span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-[var(--fg-faint)] transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-[var(--accent-ink)]"
                  strokeWidth={1.6}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const bottomBar = (
    <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-[780px]">
        {composer("up")}
        <p className="pt-2 text-center text-[11.5px] text-[var(--fg-faint)]">
          AceMate can make mistakes. Check important facts.
        </p>
      </div>
    </div>
  );

  if (showEmpty) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="scrollbar-thin thread-fade min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[940px] flex-col items-center justify-center px-5 pb-10 pt-4 text-center">
            <AceMateOrb activity="idle" size={shell.isDesktop ? 72 : 56} showLabel={false} interactive />
            {user?.name && (
              <p className="mt-9 text-[14px] text-[var(--fg-muted)]">{greeting(user.name)}</p>
            )}
            <h1
              className={`font-display text-[30px] font-semibold leading-[1.12] text-[var(--fg)] sm:text-[44px] ${
                user?.name ? "mt-2" : "mt-10"
              }`}
            >
              What are we learning today?
            </h1>
            <p className="mt-3 text-[16px] text-[var(--fg-muted)] sm:text-[18px]">Ask, study, practice, or create.</p>
            <div className="mt-10 w-full">{quickActions}</div>
            <div className="mt-4 flex w-full max-w-[780px] flex-col gap-2 text-left empty:hidden">{notices}</div>
          </div>
        </div>
        {bottomBar}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title={titleOf(messages)} />
      <div ref={scrollerRef} className="scrollbar-thin thread-fade min-h-0 flex-1 overflow-y-auto">
        <div
          className="thread mx-auto flex w-full max-w-[780px] flex-col gap-8 px-4 pb-10 pt-4 sm:px-6"
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
      {bottomBar}
    </div>
  );
}
