import { TopBar } from "@/components/TopBar";
import { Notice } from "@/components/Notice";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { AceMateOrb } from "@/components/ai/AceMateOrb";
import { useSettings } from "@/lib/settings";
import { generateNotes, type NotesResult } from "@/lib/notes";
import { getImageLimits, IS_WEB } from "@/platform";
import type { ImageLimits } from "@/platform/types";
import { Link } from "@tanstack/react-router";
import {
  saveNotes,
  listNotes,
  loadNote,
  type NoteSummary,
} from "@/lib/persistence";
import { useAuth } from "@/hooks/use-auth";


const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PAYLOAD = 15 * 1024 * 1024;

type Page = {
  id: string;
  file: File;
  dataUrl: string;
  mediaType: string;
  previewUrl: string;
};
type Stage = "idle" | "reading" | "understanding" | "building" | "ready" | "error";
type Tab = "summary" | "key" | "terms" | "cards" | "quiz";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

class ImageTooLargeError extends Error {
  constructor() {
    super(
      "This image is too large to process. Try taking the photo in normal lighting instead of scanning at high resolution."
    );
    this.name = "ImageTooLargeError";
  }
}

function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

function encodePass(
  img: HTMLImageElement,
  maxEdge: number,
  quality: number
): string {
  const longest = Math.max(img.width, img.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  if (!out.startsWith("data:image/jpeg")) throw new Error("Encode failed");
  return out;
}

/** Approximate decoded byte size of a base64 data URL. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Downscale + re-encode as JPEG.
 * Pass 1: ≤1200px longest side, quality 0.65.
 * If still >5MB, pass 2: ≤900px, quality 0.55.
 * If still >6MB after both passes, throws ImageTooLargeError.
 */
async function downscaleToJpeg(file: File): Promise<string> {
  const img = await loadImg(file);
  let out = encodePass(img, 1200, 0.65);
  if (dataUrlBytes(out) > 5 * 1024 * 1024) {
    try {
      out = encodePass(img, 900, 0.55);
    } catch {
      // keep pass-1 result on failure
    }
  }
  if (dataUrlBytes(out) > 6 * 1024 * 1024) {
    throw new ImageTooLargeError();
  }
  return out;
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}


export function NotesPage() {
  const [settings] = useSettings();
  const [subject, setSubject] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<NotesResult | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [savePromptDismissed, setSavePromptDismissed] = useState(false);
  const [saved, setSaved] = useState<NoteSummary[]>([]);
  const { user } = useAuth();


  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const generateNotesFn = generateNotes;
  const [imageLimits, setImageLimits] = useState<ImageLimits | null>(null);
  const [limitsChecked, setLimitsChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void getImageLimits().then((limits) => {
      if (!active) return;
      setImageLimits(limits);
      setLimitsChecked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const maxImages = Math.min(MAX_IMAGES, imageLimits?.maxCount ?? MAX_IMAGES);

  const refreshSaved = async () => {
    setSaved(await listNotes());
  };

  useEffect(() => {
    if (!user) {
      setSaved([]);
      return;
    }
    void refreshSaved();
  }, [user]);

  useEffect(() => {
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const isBusy =
    stage === "reading" || stage === "understanding" || stage === "building";

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError(null);
    const remaining = maxImages - pages.length;
    if (remaining <= 0) {
      setAttachError(`You can add up to ${maxImages} pages at a time.`);
      return;
    }
    const chosen = Array.from(files).slice(0, remaining);
    const skipped = files.length - chosen.length;
    const newPages: Page[] = [];
    for (const file of chosen) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError("That image is over 8 MB — try a smaller one.");
        continue;
      }
      try {
        let dataUrl: string;
        let mediaType: string;
        try {
          dataUrl = await downscaleToJpeg(file);
          mediaType = "image/jpeg";
        } catch (e) {
          if (e instanceof ImageTooLargeError) {
            setAttachError(e.message);
            continue;
          }
          dataUrl = await readAsDataUrl(file);
          mediaType = file.type;
        }
        newPages.push({
          id: crypto.randomUUID(),
          file,
          dataUrl,
          mediaType,
          previewUrl: URL.createObjectURL(file),
        });
      } catch {
        setAttachError("Couldn't read that image. Try another one.");
      }

    }
    if (skipped > 0) {
      setAttachError(`You can add up to ${maxImages} pages at a time.`);
    }
    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages]);
    }
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const openSaved = async (n: NoteSummary) => {
    const loaded = await loadNote(n.id);
    if (!loaded) {
      setStage("error");
      setErrorMsg("Couldn't open those notes. Try again.");
      return;
    }
    setSubject(n.subject ?? "");
    setResult(loaded as NotesResult);
    setTab("summary");
    setStage("ready");
    setErrorMsg(null);
  };

  const startOver = () => {
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPages([]);
    setSubject("");
    setResult(null);
    setErrorMsg(null);
    setStage("idle");
    setTab("summary");
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const run = async () => {
    if (pages.length === 0 || isBusy) return;
    setErrorMsg(null);
    const totalBytes = pages.reduce((sum, p) => sum + p.dataUrl.length, 0);
    if (totalBytes > MAX_TOTAL_PAYLOAD) {
      setStage("error");
      setErrorMsg("That's a lot of pages — try 5 or fewer at a time.");
      return;
    }
    setResult(null);
    setStage("reading");
    // progress illusion
    const t1 = setTimeout(() => setStage((s) => (s === "reading" ? "understanding" : s)), 1200);
    const t2 = setTimeout(() => setStage((s) => (s === "understanding" ? "building" : s)), 3200);
    try {
      const res = await generateNotesFn({
        subject,
        model: settings.model,
        effort: settings.effort,
        images: pages.map((p) => ({
          dataUrl: p.dataUrl,
          mediaType: p.mediaType,
        })),
      });

      clearTimeout(t1);
      clearTimeout(t2);
      if (!res.ok) {
        setStage("error");
        setErrorMsg(res.error);
        return;
      }
      setResult(res.result);
      setTab("summary");
      setStage("ready");
      setSavePromptDismissed(false);
      void saveNotes(subject, res.result).then(() => {
        if (user) void refreshSaved();
      });

    } catch (e) {
      clearTimeout(t1);
      clearTimeout(t2);
      setStage("error");
      setErrorMsg(
        e instanceof Error
          ? "Couldn't read those pages. Try clearer photos or fewer at once."
          : "Something went wrong.",
      );
    }
  };

  const stageLabel: Record<Stage, string> = {
    idle: "",
    reading: "Reading your pages…",
    understanding: "Understanding the chapter…",
    building: "Creating your notes…",
    ready: "",
    error: "",
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[680px] flex-col px-4 pb-14 pt-2 sm:px-6">
          <h1 className="font-display text-[30px] font-semibold leading-tight text-[var(--fg)]">Notes & quizzes</h1>
          <p className="mt-2 pb-7 text-[15px] leading-relaxed text-[var(--fg-muted)]">
            Photograph the pages of a chapter and AceMate turns them into a summary, flashcards and a quiz.
          </p>

          {!result && (
            <>
              <div className="glass rounded-[20px] p-4 sm:p-5">
                <label htmlFor="notes-subject" className="section-label mb-2 block px-0.5">
                  Subject or chapter
                </label>
                <input
                  id="notes-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isBusy}
                  placeholder="e.g. Biology, chapter 4: Photosynthesis"
                  className="field h-11 w-full rounded-xl px-3.5 text-[15px] disabled:opacity-60"
                />

                <div className="section-label mb-2 mt-5 px-0.5">
                  Pages <span className="tabular-nums">{pages.length}/{maxImages}</span>
                </div>

                <input
                  ref={cameraRef}
                  type="file"
                  accept={imageLimits?.mediaTypes.join(",") || "image/*"}
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    if (cameraRef.current) cameraRef.current.value = "";
                  }}
                />
                <input
                  ref={galleryRef}
                  type="file"
                  accept={imageLimits?.mediaTypes.join(",") || "image/*"}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    if (galleryRef.current) galleryRef.current.value = "";
                  }}
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isBusy || !imageLimits || pages.length >= maxImages}
                    onClick={() => cameraRef.current?.click()}
                    className="chip inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[14px] disabled:opacity-40"
                  >
                    <Camera className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.6} />
                    Take photo
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !imageLimits || pages.length >= maxImages}
                    onClick={() => galleryRef.current?.click()}
                    className="chip inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[14px] disabled:opacity-40"
                  >
                    <ImagePlus className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.6} />
                    Choose photos
                  </button>
                </div>

                {limitsChecked && !imageLimits && (
                  <Notice tone="info" className="mt-3">
                    {IS_WEB
                      ? "Photos can't be sent right now. Reload the page and try again."
                      : "Photos can't be sent from this view. Open AceMate on claude.ai in a browser to make notes."}
                  </Notice>
                )}

                {pages.length > 0 && (
                  <div className="scrollbar-thin -mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                    {pages.map((p, i) => (
                      <div
                        key={p.id}
                        className="msg-in relative shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--line)]"
                        style={{ width: 96, height: 128 }}
                      >
                        <img src={p.previewUrl} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
                        <div
                          className="absolute left-1 top-1 rounded-full px-1.5 text-[10px] font-semibold"
                          style={{ background: "var(--media-control-bg)", color: "#fff" }}
                        >
                          {i + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePage(p.id)}
                          aria-label={`Remove page ${i + 1}`}
                          disabled={isBusy}
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--media-control-bg)] text-white hover:bg-[var(--media-control-bg-hover)]"
                        >
                          <X className="h-3 w-3" strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {attachError && <Notice className="mt-3">{attachError}</Notice>}

                <button
                  type="button"
                  disabled={pages.length === 0 || isBusy}
                  onClick={run}
                  className="btn-primary mt-5 h-12 w-full rounded-full px-4 text-[15px] font-medium"
                >
                  {isBusy ? "Working on it…" : "Make my notes"}
                </button>
              </div>

              {isBusy && (
                <div className="flex justify-center py-10">
                  <AceMateOrb activity="reading" size={56} centered label={stageLabel[stage]} />
                </div>
              )}

              {errorMsg && !isBusy && (
                <Notice
                  className="mt-4"
                  action={
                    <button type="button" onClick={run} className="chip shrink-0 rounded-full px-3 py-1.5 text-[12.5px]">
                      Try again
                    </button>
                  }
                >
                  {errorMsg}
                </Notice>
              )}

              {user && saved.length > 0 && (
                <div className="mt-8">
                  <div className="section-label mb-2 px-1">Saved notes</div>
                  <div className="glass overflow-hidden rounded-[18px] [&>*+*]:border-t [&>*+*]:border-[var(--line)]">
                    {saved.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => openSaved(n)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-[var(--surface-hover)]"
                      >
                        <span className="flex-1 truncate text-[15px] text-[var(--fg)]">
                          {n.title || n.subject || "Chapter notes"}
                        </span>
                        <span className="shrink-0 text-[12px] text-[var(--fg-faint)]">{relativeDate(n.created_at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {result && !user && !savePromptDismissed && (
            <div className="glass msg-in mb-5 flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="flex-1 text-[14px] text-[var(--fg)]">
                {IS_WEB ? "Sign in to save these notes." : "Open AceMate signed in to claude.ai to save these notes."}
              </span>
              {IS_WEB && (
                <Link to="/auth" className="btn-primary rounded-full px-4 py-1.5 text-[13px] font-medium">
                  Sign in
                </Link>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setSavePromptDismissed(true)}
                className="round-btn h-8 w-8"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          )}

          {result && (
            <ResultView result={result} subject={subject} tab={tab} setTab={setTab} onStartOver={startOver} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultView({
  result,
  subject,
  tab,
  setTab,
  onStartOver,
}: {
  result: NotesResult;
  subject: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  onStartOver: () => void;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "key", label: "Key points" },
    { key: "terms", label: "Terms" },
    { key: "cards", label: "Flashcards" },
    { key: "quiz", label: "Quiz" },
  ];

  return (
    <div className="flex flex-col">
      <div className="section-label mb-1.5">{subject.trim() ? `Notes · ${subject.trim()}` : "Your notes"}</div>
      <div className="font-display mb-5 text-[26px] font-semibold leading-tight text-[var(--fg)]">{result.title}</div>

      <div className="scrollbar-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`h-8 shrink-0 rounded-full border px-3.5 text-[13px] transition-colors duration-200 ${
                active
                  ? "border-[rgba(var(--accent-3-rgb),0.4)] bg-[var(--glass-strong)] text-[var(--fg)]"
                  : "border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "summary" && (
        <SummaryPanel
          text={result.summary}
          title={result.title}
          subject={subject}
        />
      )}
      {tab === "key" && <KeyPointsPanel points={result.keyPoints} />}
      {tab === "terms" && <TermsPanel terms={result.terms} />}
      {tab === "cards" && <FlashcardsPanel cards={result.flashcards} />}
      {tab === "quiz" && <QuizPanel quiz={result.quiz} />}

      <button
        type="button"
        onClick={onStartOver}
        className="chip mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[14px]"
      >
        <RotateCcw className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.6} />
        Start over
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function SummaryPanel({
  text,
  title,
  subject,
}: {
  text: string;
  title: string;
  subject: string;
}) {
  return (
    <div className="glass rounded-[20px] p-6 sm:p-7">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] font-bold leading-tight text-[var(--fg)]">
            {title}
          </h2>
          {subject.trim() && (
            <div className="mt-1.5 text-[12.5px] text-[var(--fg-muted)]">{subject.trim()}</div>
          )}
        </div>
        <CopyButton text={text} />
      </div>

      <p
        className="max-w-[60ch] text-[17px] text-[color:var(--ice)]"
        style={{ lineHeight: 1.7 }}
      >
        {text || "No summary available."}
      </p>

    </div>
  );
}

function KeyPointsPanel({ points }: { points: string[] }) {
  const asText = useMemo(() => points.map((p) => `• ${p}`).join("\n"), [points]);
  if (points.length === 0) {
    return <EmptyPanel>No key points found.</EmptyPanel>;
  }
  return (
    <div className="glass rounded-[20px] p-5">
      <div className="mb-3 flex justify-end">
        <CopyButton text={asText} />
      </div>
      <ul className="flex flex-col gap-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] text-[color:var(--ice)]">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,var(--accent-3),var(--accent-2))]" />
            <span className="leading-relaxed">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermsPanel({
  terms,
}: {
  terms: { term: string; definition: string }[];
}) {
  if (terms.length === 0) {
    return <EmptyPanel>No key terms found.</EmptyPanel>;
  }
  return (
    <div className="flex flex-col gap-3">
      {terms.map((t, i) => (
        <div key={i} className="glass rounded-[18px] p-4">
          <div className="text-[15px] font-semibold text-[color:var(--ice)]">
            {t.term}
          </div>
          <div className="mt-1 text-[14px] leading-relaxed text-[color:var(--ice-dim)]">
            {t.definition}
          </div>
        </div>
      ))}
    </div>
  );
}

function FlashcardsPanel({
  cards,
}: {
  cards: { question: string; answer: string }[];
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (cards.length === 0) {
    return <EmptyPanel>No flashcards.</EmptyPanel>;
  }
  const card = cards[Math.min(i, cards.length - 1)];
  const go = (delta: number) => {
    setFlipped(false);
    setI((prev) => Math.max(0, Math.min(prev + delta, cards.length - 1)));
  };
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show the question" : "Show the answer"}
        className="flip w-full text-left"
      >
        <span className={`flip-inner ${flipped ? "is-flipped" : ""}`}>
          {(["question", "answer"] as const).map((side) => (
            <span
              key={side}
              aria-hidden={flipped ? side === "question" : side === "answer"}
              className={`flip-face glass flex min-h-[230px] flex-col rounded-[22px] px-6 py-5 ${side === "answer" ? "flip-back" : ""}`}
            >
              <span className="section-label">{side === "question" ? "Question" : "Answer"}</span>
              <span className="flex flex-1 items-center py-4 text-[18px] leading-relaxed text-[var(--fg)]">
                {side === "question" ? card.question : card.answer}
              </span>
              <span className="self-end text-[11.5px] text-[var(--fg-faint)]">Tap to flip</span>
            </span>
          ))}
        </span>
      </button>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          className="chip inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
          Previous
        </button>
        <div className="text-[12.5px] tabular-nums text-[var(--fg-muted)]">
          {i + 1} / {cards.length}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === cards.length - 1}
          className="chip inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function QuizPanel({
  quiz,
}: {
  quiz: { question: string; options: string[]; correctIndex: number }[];
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    quiz.map(() => null),
  );

  if (quiz.length === 0) {
    return <EmptyPanel>No quiz available.</EmptyPanel>;
  }

  const reset = () => {
    setI(0);
    setAnswers(quiz.map(() => null));
  };

  const done = i >= quiz.length;
  if (done) {
    const score = answers.reduce<number>(
      (n, a, idx) => (a === quiz[idx].correctIndex ? n + 1 : n),
      0,
    );
    return (
      <div className="glass msg-in flex flex-col items-center rounded-[22px] px-5 py-9 text-center">
        <div className="font-display text-[40px] font-semibold tabular-nums text-[var(--fg)]">
          {score} / {quiz.length}
        </div>
        <div className="mt-1 text-[14px] text-[color:var(--ice-dim)]">
          You got {score} out of {quiz.length}
        </div>
        <button
          type="button"
          onClick={reset}
          className="btn-primary mt-6 rounded-full px-5 py-2 text-[13px] font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  const q = quiz[i];
  const chosen = answers[i];
  const answered = chosen != null;

  const pick = (idx: number) => {
    if (answered) return;
    setAnswers((prev) => {
      const next = prev.slice();
      next[i] = idx;
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <div className="section-label mb-2 px-1 tabular-nums">
        Question {i + 1} of {quiz.length}
      </div>
      <div className="glass rounded-[20px] p-5">
        <div className="mb-4 text-[16px] leading-relaxed text-[color:var(--ice)]">
          {q.question}
        </div>
        <div className="flex flex-col gap-2">
          {q.options.map((opt, idx) => {
            const isCorrect = idx === q.correctIndex;
            const isChosen = chosen === idx;
            let bg = "var(--glass)";
            let border = "var(--line)";
            if (answered) {
              if (isCorrect) {
                bg = "rgba(52, 211, 153, 0.12)";
                border = "rgba(52, 211, 153, 0.5)";
              } else if (isChosen) {
                bg = "rgba(251, 113, 133, 0.1)";
                border = "rgba(251, 113, 133, 0.45)";
              }
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={() => pick(idx)}
                disabled={answered}
                className="rounded-xl px-4 py-3 text-left text-[14.5px] text-[var(--fg)] transition-colors duration-200 enabled:hover:bg-[var(--glass-strong)]"
                style={{ background: bg, border: `1px solid ${border}` }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!answered}
          onClick={() => setI((n) => n + 1)}
          className="btn-primary rounded-full px-5 py-2 text-[13px] font-medium"
        >
          {i === quiz.length - 1 ? "See score" : "Next question"}
        </button>
      </div>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass rounded-[18px] px-4 py-6 text-center text-[14px] text-[var(--fg-muted)]">
      {children}
    </div>
  );
}
