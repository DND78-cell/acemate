import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Type, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Composer } from "@/components/Composer";
import { ChatMessage, questionNumbers } from "@/components/ChatMessage";
import { ANSWER_DISCLAIMER } from "@/components/Notebook";
import { messageText, reasoningText, ThinkingActivity } from "@/components/ai/AiResponseActivity";
import { useAuth } from "@/hooks/use-auth";
import {
  listCompanionActivity,
  saveCompanionSessionStart,
  setCompanionSessionCount,
  type ActivitySession,
} from "@/lib/persistence";
import { useSettings, TEXT_SIZE_PX } from "@/lib/settings";
import { newId, useAceChat } from "@/lib/chat";
import { dataUrlToBlob, sampleErrorCopy } from "@/lib/claude";
import { getImageLimits, IS_WEB } from "@/platform";
import type { ImageLimits } from "@/platform/types";
import { COMPANION_SYSTEM_PROMPT } from "@/lib/prompts";

const STARTERS = [
  "Give me a full summary of all these notes",
  "Make flashcards from everything",
  "Quiz me on the key points",
  "What are the most important things to remember?",
  "Explain the hardest concept here in simple terms",
];

const MAX_PHOTOS = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1200;

type PhotoSource = {
  id: string;
  kind: "image";
  dataUrl: string;
  mediaType: string;
  previewUrl: string;
  name: string;
};
type TextSource = { id: string; kind: "text"; text: string };
type Source = PhotoSource | TextSource;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

function downscaleToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.width, img.height);
        const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

export function CompanionPage() {
  const [settings] = useSettings();
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState(() => newId());
  const [sources, setSources] = useState<Source[]>([]);
  const [subject, setSubject] = useState("");
  const [input, setInput] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityMonth, setActivityMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [activitySessions, setActivitySessions] = useState<ActivitySession[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thoughtDurations, setThoughtDurations] = useState<Record<string, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistedSessionRef = useRef<Promise<string | null> | null>(null);
  const sessionCountRef = useRef(0);
  const [imageLimits, setImageLimits] = useState<ImageLimits | null>(null);

  useEffect(() => {
    let active = true;
    void getImageLimits().then((limits) => {
      if (active) setImageLimits(limits);
    });
    return () => {
      active = false;
    };
  }, []);

  const maxPhotos = Math.min(MAX_PHOTOS, imageLimits?.maxCount ?? MAX_PHOTOS);

  const sourcesRef = useRef<Source[]>(sources);
  const subjectRef = useRef(subject);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);
  useEffect(() => {
    subjectRef.current = subject;
  }, [subject]);

  useEffect(() => {
    if (!activityOpen || !user) return;
    let active = true;
    setActivityLoading(true);
    void listCompanionActivity(activityMonth.getFullYear(), activityMonth.getMonth() + 1).then((sessions) => {
      if (active) setActivitySessions(sessions);
    }).catch((activityError) => {
      console.error("loadCompanionActivity failed", activityError);
      if (active) setActivitySessions([]);
    }).finally(() => {
      if (active) setActivityLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activityMonth, activityOpen, user]);

  const { messages, sendMessage, status, error, setMessages, stop } = useAceChat({
    id: sessionId,
    request: () => {
      const list = sourcesRef.current;
      const notes = list
        .filter((src): src is TextSource => src.kind === "text" && Boolean(src.text.trim()))
        .map((src) => `Note:\n${src.text.trim()}`);
      const photos = list.filter((src): src is PhotoSource => src.kind === "image");
      const header = [
        "Here is the student's study material for this session.",
        subjectRef.current.trim() ? `Subject: ${subjectRef.current.trim()}` : null,
        photos.length
          ? `${photos.length} photo${photos.length === 1 ? " of their material is" : "s of their material are"} attached.`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        instructions: [COMPANION_SYSTEM_PROMPT, header, ...notes].join("\n\n"),
        modelTier: "quick",
        model: "aceOne",
        effort: "balanced",
        extraImages: photos.map((src) => dataUrlToBlob(src.dataUrl)),
      };
    },
  });

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

  const photoCount = sources.filter((s) => s.kind === "image").length;

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    setSourceError(null);

    const room = maxPhotos - photoCount;
    if (room <= 0) {
      setSourceError(`You can add up to ${maxPhotos} photos.`);
      return;
    }

    const next: PhotoSource[] = [];
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        setSourceError("That image is over 8 MB — try a smaller one.");
        continue;
      }
      try {
        let dataUrl: string;
        let mediaType = "image/jpeg";
        try {
          dataUrl = await downscaleToJpeg(file);
        } catch {
          dataUrl = await readAsDataUrl(file);
          mediaType = file.type;
        }
        next.push({
          id: newId(),
          kind: "image",
          dataUrl,
          mediaType,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
        });
      } catch {
        setSourceError("Couldn't read that image. Try another one.");
      }
    }
    if (next.length > 0) setSources((prev) => [...prev, ...next]);
  };

  const addText = () => {
    const t = textDraft.trim();
    if (!t) return;
    setSources((prev) => [...prev, { id: newId(), kind: "text", text: t }]);
    setTextDraft("");
    setTextOpen(false);
  };

  const removeSource = (id: string) => {
    setSources((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target && target.kind === "image") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const clearSession = () => {
    sources.forEach((s) => {
      if (s.kind === "image") URL.revokeObjectURL(s.previewUrl);
    });
    setSources([]);
    setSubject("");
    setInput("");
    setTextDraft("");
    setTextOpen(false);
    setSourceError(null);
    setMessages([]);
    setThinkingStartedAt(null);
    setThoughtDurations({});
    setSessionId(newId());
    persistedSessionRef.current = null;
    sessionCountRef.current = 0;
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    if (user) {
      if (messages.length === 0 || !persistedSessionRef.current) {
        sessionCountRef.current = 1;
        persistedSessionRef.current = saveCompanionSessionStart(subject);
      } else {
        const count = ++sessionCountRef.current;
        persistedSessionRef.current = persistedSessionRef.current.then(async (id) => {
          if (id) await setCompanionSessionCount(id, count);
          return id;
        });
      }
    }
    const snapshot = input;
    setInput("");
    setThinkingStartedAt(Date.now());
    sendMessage({ parts: [{ type: "text", text: trimmed }] }).catch(() => {
      setThinkingStartedAt(null);
      setInput(snapshot);
    });
  };

  const numbers = questionNumbers(messages);

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="Study companion"
        trailing={
          <button
            type="button"
            onClick={clearSession}
            className="h-8 rounded-lg px-3 text-[13px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          >
            Clear session
          </button>
        }
      />

      {/* Sources */}
      <section className="notebook shrink-0 pb-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="companion-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="h-9 min-w-[140px] flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 text-[14px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--line-strong)]"
            />
            <input
              ref={fileRef}
              type="file"
              accept={imageLimits?.mediaTypes.join(",") || "image/*"}
              multiple
              className="hidden"
              onChange={onFileChosen}
            />
            {imageLimits && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="chip inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px]"
              >
                <ImagePlus className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} /> Add photo
              </button>
            )}
            <button
              type="button"
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
              className="chip inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px]"
            >
              <Type className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} /> Add text
            </button>
          </div>

          {textOpen && (
            <div className="mt-2">
              <textarea
                id="companion-text"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                rows={3}
                placeholder="Paste or type notes / context…"
                className="w-full resize-none rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-[14px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--line-strong)]"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTextOpen(false);
                    setTextDraft("");
                  }}
                  className="h-8 rounded-lg px-3 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addText}
                  disabled={!textDraft.trim()}
                  className="h-8 rounded-lg bg-[var(--primary-bg)] px-3 text-[13px] font-medium text-[var(--primary-fg)] disabled:opacity-35"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {sourceError && (
            <div className="mt-2 rounded-lg border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-3 py-2 text-[12.5px] text-[var(--fg)]">
              {sourceError}
            </div>
          )}

          {sources.length > 0 && (
            <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-1 pt-1.5">
              {sources.map((src) =>
                src.kind === "image" ? (
                  <div key={src.id} className="relative shrink-0">
                    <img
                      src={src.previewUrl}
                      alt={src.name}
                      className="h-16 w-16 rounded-lg border border-[var(--line)] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeSource(src.id)}
                      aria-label="Remove photo"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary-bg)] text-[var(--primary-fg)]"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={src.id}
                    className="flex h-16 w-[160px] shrink-0 items-start gap-1.5 rounded-lg border border-[var(--line)] px-2 py-1.5"
                  >
                    <p className="line-clamp-3 flex-1 text-[12px] leading-snug text-[var(--fg-muted)]">{src.text}</p>
                    <button
                      type="button"
                      onClick={() => removeSource(src.id)}
                      aria-label="Remove note"
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--fg-faint)] hover:text-[var(--fg)]"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
          <p className="mt-2 text-[12px] text-[var(--fg-faint)]">
            {imageLimits
              ? `${photoCount}/${maxPhotos} photos · sources stay for the whole session`
              : "Sources stay for the whole session"}
          </p>
        </div>
      </section>

      {/* Chat */}
      <div ref={scrollerRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="notebook flex min-h-full flex-col gap-4 pb-6 pt-1"
          style={{ fontSize: TEXT_SIZE_PX[settings.textSize] }}
        >
          {messages.length === 0 ? (
            <div>
              <p className="px-1 pb-2 text-[13px] text-[var(--fg-muted)]">
                Add your material above, then start the session.
              </p>
              <ul className="ruled-list border-y border-[var(--line)]">
                {STARTERS.map((st) => (
                  <li key={st}>
                    <button
                      type="button"
                      onClick={() => submit(st)}
                      className="w-full px-1 py-3 text-left text-[14.5px] text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      {st}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  number={numbers.get(m.id)}
                  thoughtSeconds={thoughtDurations[m.id]}
                  writing={status === "streaming" && currentAssistant?.id === m.id && Boolean(currentText)}
                />
              ))}
              {isThinking && thinkingStartedAt && (
                <ThinkingActivity startedAt={thinkingStartedAt} reasoning={currentReasoning} />
              )}
              {error && (
                <div className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13.5px] text-[var(--fg)]">
                  {sampleErrorCopy(error, "Something went wrong — try again.")}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CompanionActivity
        open={activityOpen}
        onToggle={() => setActivityOpen((value) => !value)}
        userSignedIn={Boolean(user)}
        month={activityMonth}
        onMonthChange={setActivityMonth}
        sessions={activitySessions}
        loading={activityLoading}
      />

      {/* Composer */}
      <div className="shrink-0">
        <div className="notebook">
          <div className="relative">
            <span className="margin-note" style={{ top: "0.8rem" }} aria-hidden="true">
              Q{numbers.size + 1}
            </span>
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => submit(input)}
              onStop={stop}
              busy={isLoading}
              canSend={!!input.trim() && !isLoading}
              placeholder="Ask about your material…"
              inputRef={inputRef}
            />
          </div>
          <p className="py-2 text-[11.5px] text-[var(--fg-faint)]">{ANSWER_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}

function CompanionActivity({
  open,
  onToggle,
  userSignedIn,
  month,
  onMonthChange,
  sessions,
  loading,
}: {
  open: boolean;
  onToggle: () => void;
  userSignedIn: boolean;
  month: Date;
  onMonthChange: (month: Date) => void;
  sessions: ActivitySession[];
  loading: boolean;
}) {
  const dayCounts = new Map<number, number>();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const session of sessions) {
    const started = new Date(session.started_at);
    if (started.getMonth() !== month.getMonth() || started.getFullYear() !== month.getFullYear()) {
      continue;
    }
    dayCounts.set(started.getDate(), (dayCounts.get(started.getDate()) ?? 0) + 1);
    hourCounts[started.getHours()] += 1;
  }
  const maxDay = Math.max(0, ...dayCounts.values());
  const maxHour = Math.max(0, ...hourCounts);
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - firstWeekday + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    }),
  );
  const intensity = (count: number, max: number) => {
    if (count === 0 || max === 0) return 0;
    return Math.min(4, Math.ceil((count / max) * 4));
  };
  const dotClass = [
    "bg-[color:var(--ice)]/[0.08]",
    "bg-[color:var(--ice)]/[0.25]",
    "bg-[color:var(--ice)]/[0.45]",
    "bg-[color:var(--ice)]/[0.7]",
    "bg-[color:var(--ice)]",
  ];

  return (
    <section className="notebook shrink-0 pb-2">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[13px] font-medium text-[var(--fg)]">Activity</span>
          <ChevronDown
            className={`h-4 w-4 text-[color:var(--ice-dim)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="pt-3">
            {!userSignedIn ? (
              <p className="pb-1 text-[12px] text-[color:var(--ice-dim)]">
                {IS_WEB ? "Sign in to see your activity." : "Open AceMate signed in to claude.ai to see your activity."}
              </p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                    }
                    className="chip flex h-7 w-7 items-center justify-center rounded-full"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[12px] font-medium text-[color:var(--ice)]">
                    {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                    }
                    className="chip flex h-7 w-7 items-center justify-center rounded-full"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-50" : ""}`}>
                  <div className="min-w-[300px]">
                    <div className="grid grid-cols-[16px_repeat(6,1fr)] gap-x-2 gap-y-1.5">
                      {["S", "M", "T", "W", "T", "F", "S"].map((label, weekday) => (
                        <div key={`${label}-${weekday}`} className="contents">
                          <span className="flex h-3 items-center text-[9px] text-[color:var(--ice-dim)]">
                            {label}
                          </span>
                          {weeks.map((week, weekIndex) => {
                            const day = week[weekday];
                            const count = day ? dayCounts.get(day) ?? 0 : 0;
                            return day ? (
                              <span
                                key={`${weekday}-${weekIndex}`}
                                title={`${count} session${count === 1 ? "" : "s"}`}
                                className={`mx-auto h-3 w-3 rounded-full ${dotClass[intensity(count, maxDay)]}`}
                              />
                            ) : (
                              <span key={`${weekday}-${weekIndex}`} className="h-3 w-3" />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-[color:var(--ice-dim)]">
                      <span>Less</span>
                      {dotClass.map((className, index) => (
                        <span key={index} className={`h-2.5 w-2.5 rounded-full ${className}`} />
                      ))}
                      <span>More</span>
                    </div>

                    <div className="mt-4 border-t border-[color:var(--ice)]/10 pt-3">
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ice-dim)]">
                        Peak hour
                      </p>
                      <div className="grid grid-cols-12 gap-x-1 gap-y-2">
                        {hourCounts.map((count, hour) => (
                          <div key={hour} className="flex flex-col items-center gap-1">
                            <span
                              title={`${count} session${count === 1 ? "" : "s"}`}
                              className={`h-2.5 w-2.5 rounded-full ${dotClass[intensity(count, maxHour)]}`}
                            />
                            <span className="text-[8px] text-[color:var(--ice-dim)]">
                              {hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
