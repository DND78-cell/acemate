/**
 * Thin access layer over the claude.ai runtime capabilities that replace
 * AceMate's Lovable backend: `sample` (the AI), `db` + `user` (saved chats,
 * notes and Companion activity per signed-in person), `downloads` (Code
 * page export). Every getter resolves null when the page runs somewhere the
 * capability isn't served, so callers degrade instead of crashing.
 */

type Sample = typeof Claude.sample;
type User = typeof Claude.user;
type Downloads = typeof Claude.downloads;

function use<T>(name: string): Promise<T | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c || typeof c.use !== "function") return Promise.resolve(null);
  return c.use(name).then(
    (ns) => (ns ?? null) as T | null,
    () => null,
  );
}

let samplePromise: Promise<Sample | null> | null = null;
export function getSample(): Promise<Sample | null> {
  samplePromise ??= use<Sample>("sample");
  return samplePromise;
}

let dbPromise: Promise<DB | null> | null = null;
export function getDb(): Promise<DB | null> {
  dbPromise ??= use<DB>("db");
  return dbPromise;
}

let userPromise: Promise<User | null> | null = null;
export function getUser(): Promise<User | null> {
  userPromise ??= use<User>("user");
  return userPromise;
}

let downloadsPromise: Promise<Downloads | null> | null = null;
export function getDownloads(): Promise<Downloads | null> {
  downloadsPromise ??= use<Downloads>("downloads");
  return downloadsPromise;
}

export type ImageLimits = { maxCount: number; maxInputBytes: number; mediaTypes: string[] };

let imageLimitsPromise: Promise<ImageLimits | null> | null = null;
/** What this view can send to Claude as images, or null when it can't. */
export function getImageLimits(): Promise<ImageLimits | null> {
  imageLimitsPromise ??= getSample().then(async (sample) => {
    if (!sample) return null;
    try {
      const limits = await sample.limits();
      return limits.images ?? null;
    } catch {
      return null;
    }
  });
  return imageLimitsPromise;
}

/** Decode a base64 data URL into a Blob without touching the network. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma);
  const mediaType = meta.split(";")[0] || "application/octet-stream";
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

export type SampleFailure = { code: string; message?: string; text?: string };

export function isSampleFailure(e: unknown): e is SampleFailure {
  return typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string";
}

/** Viewer-facing copy for a failed AI call. */
export function sampleErrorCopy(e: unknown, fallback: string): string {
  const code = isSampleFailure(e) ? e.code : "";
  switch (code) {
    case "unavailable_here":
      return "AceMate answers only when it's opened on claude.ai.";
    case "not_granted":
      return "AceMate needs permission to use Claude. Reload the page and choose Allow.";
    case "sampling_disabled":
    case "capability_disabled":
    case "capability_removed":
    case "not_declared":
      return "Claude isn't available for this account right now.";
    case "rate_limited":
      return "You've hit your usage limit for now. Try again in a little while.";
    case "session_expired":
      return "Your claude.ai session expired. Sign in again, then retry.";
    case "refused":
      return "Claude declined that request. Try rephrasing it.";
    case "prompt_too_large":
      return "That's too much text for one request. Start a new chat or send less.";
    case "image_rejected":
      return "That image couldn't be used. Try a different JPEG, PNG, WebP or GIF.";
    case "images_unavailable":
      return "Images can't be sent from this view. Try again without the image.";
    // The standalone website's server
    case "sign_in_required":
      return "Sign in to keep using AceMate.";
    case "busy":
      return "AceMate is busy right now. Try again in a moment.";
    case "not_configured":
      return "AceMate's AI isn't set up yet. The site owner needs to add an Anthropic API key.";
    case "bad_request":
      return "That request couldn't be processed. Try a shorter message or a different image.";
    case "too_large":
      return "That's too much to send at once. Try a smaller image or less text.";
    case "network":
      return "Couldn't reach AceMate's server. Check your connection and try again.";
    default:
      return fallback;
  }
}
