import { dataUrlToBlob, isSampleFailure, sampleErrorCopy } from "@/lib/claude";
import { platform } from "@/platform";
import { notesInstructions } from "@/lib/prompts";
import type { EffortMode, ModelId } from "@/lib/settings";

export type NotesResult = {
  title: string;
  summary: string;
  keyPoints: string[];
  terms: { term: string; definition: string }[];
  flashcards: { question: string; answer: string }[];
  quiz: { question: string; options: string[]; correctIndex: number }[];
};

type Raw = Partial<{
  title: unknown;
  summary: unknown;
  keyPoints: unknown;
  terms: unknown;
  flashcards: unknown;
  quiz: unknown;
}>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Same clean-up the original server applied to the model's output. */
function sanitize(raw: Raw): NotesResult {
  const quiz = arr(raw.quiz)
    .map((q) => q as { question?: unknown; options?: unknown; correctIndex?: unknown })
    .map((q) => ({
      question: str(q.question),
      options: arr(q.options).map(str).filter(Boolean),
      correctIndex: Number.isFinite(Number(q.correctIndex)) ? Math.trunc(Number(q.correctIndex)) : 0,
    }))
    .filter((q) => q.question && q.options.length >= 2)
    .map((q) => ({
      question: q.question,
      options: q.options.slice(0, 4),
      correctIndex: Math.max(0, Math.min(q.correctIndex, Math.min(q.options.length, 4) - 1)),
    }));

  return {
    title: str(raw.title) || "Chapter notes",
    summary: str(raw.summary),
    keyPoints: arr(raw.keyPoints).map(str).filter(Boolean),
    terms: arr(raw.terms)
      .map((t) => t as { term?: unknown; definition?: unknown })
      .map((t) => ({ term: str(t.term), definition: str(t.definition) }))
      .filter((t) => t.term && t.definition),
    flashcards: arr(raw.flashcards)
      .map((f) => f as { question?: unknown; answer?: unknown })
      .map((f) => ({ question: str(f.question), answer: str(f.answer) }))
      .filter((f) => f.question && f.answer),
    quiz,
  };
}

export async function generateNotes(data: {
  subject: string;
  model: ModelId;
  effort: EffortMode;
  images: { dataUrl: string; mediaType: string }[];
}): Promise<{ ok: true; result: NotesResult } | { ok: false; error: string }> {
  const images = data.images.map((img) => dataUrlToBlob(img.dataUrl));
  try {
    const raw = (await platform.notes({
      prompt: notesInstructions(images.length, data.effort, data.subject),
      images,
      model: data.model,
      effort: data.effort,
    })) as Raw;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Couldn't read those pages. Try clearer photos or fewer at once." };
    }
    return { ok: true, result: sanitize(raw) };
  } catch (e) {
    if (isSampleFailure(e) && (e.code === "invalid_json" || e.code === "empty_completion" || e.code === "unreadable")) {
      return { ok: false, error: "Couldn't read those pages. Try clearer photos or fewer at once." };
    }
    return { ok: false, error: sampleErrorCopy(e, "Notes generation failed. Try again.") };
  }
}
