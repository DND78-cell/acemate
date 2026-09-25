import { getDownloads, getImageLimits, getSample, getUser } from "@/lib/claude";
import { artifactStore } from "@/platform/artifact-store";
import type { AceUser, Platform } from "@/platform/types";

/** AceMate as a claude.ai page: the viewer's own Claude answers and saves. */

let viewerPromise: Promise<AceUser | null> | null = null;
function loadViewer(): Promise<AceUser | null> {
  viewerPromise ??= getUser()
    .then(async (user) => {
      if (!user) return null;
      const me = await user.me();
      if (!me.id) return null;
      return { id: me.id, name: me.name, avatarUrl: me.avatarUrl };
    })
    .catch(() => null);
  return viewerPromise;
}

export const artifactPlatform: Platform = {
  kind: "artifact",

  async chat(call, { signal, onText }) {
    const sample = await getSample();
    if (!sample) throw { code: "unavailable_here" };
    // `sample` has no system prompt: standing instructions lead as a user turn.
    const header = {
      role: "user" as const,
      content: `Standing instructions from the AceMate app for this whole conversation (not typed by the user):\n\n${call.instructions}`,
    };
    const result = await sample([header, ...call.turns], {
      cache: false,
      signal,
      modelTier: call.tier,
      ...(call.images.length ? { images: call.images } : {}),
      onText: ({ text }) => onText(text),
    });
    return { text: result.text, tierApplied: result.modelTierApplied };
  },

  async notes({ prompt, images, model }) {
    const sample = await getSample();
    if (!sample) throw { code: "unavailable_here" };
    return sample.json(prompt, {
      images,
      modelTier: model === "aceUltra" ? "complex" : "default",
      cache: false,
    });
  },

  imageLimits: getImageLimits,
  // Limits here are the viewer's claude.ai plan's, which a page can't read.
  usage: async () => null,

  viewer: loadViewer,
  onViewerChange: () => () => undefined,
  accounts: null,

  store: artifactStore,

  async download(filename, data) {
    const downloads = await getDownloads();
    if (!downloads) return "unavailable";
    try {
      await downloads.save({ filename, data });
      return "saved";
    } catch (e) {
      return (e as { code?: string })?.code === "declined" ? "declined" : "unavailable";
    }
  },
};
