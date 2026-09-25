// Claude, through the official Anthropic SDK. The API key stays on the
// server; the browser only ever talks to AceMate's own /api routes.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ACEMATE_MODEL || "claude-opus-5";
// Ace One can run on a separate, faster model (e.g. claude-haiku-4-5).
const FAST_MODEL = process.env.ACEMATE_FAST_MODEL || MODEL;
const FALLBACKS_ON = (process.env.ACEMATE_FALLBACKS ?? "on") !== "off";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the API's per-image limit
export const MAX_IMAGES = 10;

let client = null;
let clientError = null;
function getClient() {
  if (client || clientError) return client;
  try {
    // Reads ANTHROPIC_API_KEY (or another configured credential) from the environment.
    client = new Anthropic({ maxRetries: 2 });
  } catch (e) {
    clientError = e;
  }
  return client;
}

/** Whether a Claude credential is set, so the app can say so instead of failing each request. */
export function aiConfigured() {
  const env = process.env;
  const hasCredential = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE);
  return hasCredential && Boolean(getClient());
}

// Haiku 4.5 takes neither adaptive thinking nor effort.
const supportsAdaptive = (model) => !/^claude-haiku/.test(model);
// Server-side refusal fallbacks apply to the models whose safety classifiers can decline.
const supportsFallbacks = (model) => /^claude-(opus-5|fable-5|mythos-5)/.test(model);

/**
 * Ace One is the quick everyday option, Ace Ultra the deep one; the Effort
 * picker moves each along the model's effort scale.
 */
export function pickModel(model, effort) {
  const ultra = model === "aceUltra";
  const levels = ultra
    ? { quick: "medium", balanced: "high", max: "max" }
    : { quick: "low", balanced: "medium", max: "high" };
  return { model: ultra ? MODEL : FAST_MODEL, effort: levels[effort] ?? levels.balanced };
}

function requestOptions(model, effort, extra = {}) {
  const adaptive = supportsAdaptive(model);
  const fallbacks = FALLBACKS_ON && supportsFallbacks(model);
  const { format, ...rest } = extra;
  const outputConfig = { ...(adaptive ? { effort } : {}), ...(format ? { format } : {}) };
  return {
    model,
    ...(adaptive ? { thinking: { type: "adaptive", display: "summarized" } } : {}),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    // A declined request is re-run server-side on Anthropic's recommended model.
    ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    ...rest,
  };
}

function imageBlocks(images) {
  return images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.data },
  }));
}

/** The conversation with the images attached to the newest user message. */
function toMessages(turns, images) {
  const messages = turns.map((t) => ({ role: t.role, content: t.content }));
  const last = messages[messages.length - 1];
  if (images.length && last?.role === "user") {
    last.content = [...imageBlocks(images), { type: "text", text: last.content }];
  }
  return messages;
}

/** Stable, viewer-safe error codes for the browser. */
export function errorCode(err) {
  if (err instanceof Anthropic.APIUserAbortError) return "cancelled";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "not_configured";
  if (err instanceof Anthropic.RateLimitError) return "busy";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.APIConnectionError) return "upstream_error";
  if (err instanceof Anthropic.APIError) return "upstream_error";
  return "upstream_error";
}

/**
 * Stream one chat answer. `send` receives events for the browser:
 * {type:"reasoning", delta} while Claude thinks, {type:"text", delta} as it
 * writes, then {type:"done", truncated} or {type:"error", code}.
 */
export async function streamChat({ system, turns, images, model, effort, signal }, send) {
  const anthropic = aiConfigured() ? getClient() : null;
  if (!anthropic) return send({ type: "error", code: "not_configured" });
  const pick = pickModel(model, effort);

  try {
    const stream = anthropic.beta.messages.stream(
      {
        ...requestOptions(pick.model, pick.effort, { cache_control: { type: "ephemeral" } }),
        max_tokens: 64000,
        system,
        messages: toMessages(turns, images),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue;
      if (event.delta.type === "text_delta") send({ type: "text", delta: event.delta.text });
      else if (event.delta.type === "thinking_delta") send({ type: "reasoning", delta: event.delta.thinking });
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return send({ type: "error", code: "refused" });
    send({ type: "done", truncated: message.stop_reason === "max_tokens" });
  } catch (err) {
    const code = errorCode(err);
    if (code !== "cancelled") console.error("chat failed:", err?.status ?? "", err?.message ?? err);
    send({ type: "error", code });
  }
}

/**
 * One structured answer (Chapter Notes): Claude replies in exactly the JSON
 * shape of `schema`.
 */
export async function generateJson({ prompt, images, schema, model, effort, signal }) {
  const anthropic = aiConfigured() ? getClient() : null;
  if (!anthropic) return { error: "not_configured" };
  const pick = pickModel(model, effort);

  try {
    const stream = anthropic.beta.messages.stream(
      {
        ...requestOptions(pick.model, pick.effort, { format: { type: "json_schema", schema } }),
        max_tokens: 32000,
        messages: toMessages([{ role: "user", content: prompt }], images),
      },
      { signal },
    );
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return { error: "refused" };
    if (message.stop_reason === "max_tokens") return { error: "unreadable" };
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { error: "unreadable" };
    }
  } catch (err) {
    const code = errorCode(err);
    if (code !== "cancelled") console.error("json request failed:", err?.status ?? "", err?.message ?? err);
    return { error: code };
  }
}
