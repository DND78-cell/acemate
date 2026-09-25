import type { UIMessage } from "@/lib/chat";

// Saved conversations keep the words and small copies of attached images;
// Claude's reasoning isn't saved.

/** Largest saved conversation, in JSON characters. */
export const MAX_DOC_CHARS = 230_000;

/** Shrink an attached image to a small JPEG so saved chats stay compact. */
function thumbnail(dataUrl: string, maxEdge = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.width, img.height);
        const scale = longest > maxEdge ? maxEdge / longest : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

const thumbCache = new Map<string, string>();

export async function compactMessages(messages: UIMessage[]): Promise<UIMessage[]> {
  const out: UIMessage[] = [];
  for (const m of messages) {
    const parts = [];
    for (const p of m.parts) {
      if (p.type === "reasoning") continue;
      if (p.type === "file") {
        let small = thumbCache.get(p.url);
        if (small === undefined) {
          small = p.url.length > 60_000 ? await thumbnail(p.url) : p.url;
          thumbCache.set(p.url, small);
        }
        if (small) parts.push({ ...p, url: small, mediaType: small === p.url ? p.mediaType : "image/jpeg" });
        continue;
      }
      parts.push(p);
    }
    out.push({ ...m, parts });
  }
  // Still too big for one saved document: keep the words, drop the pictures.
  if (JSON.stringify(out).length > MAX_DOC_CHARS) {
    return out.map((m) => ({ ...m, parts: m.parts.filter((p) => p.type !== "file") }));
  }
  return out;
}
