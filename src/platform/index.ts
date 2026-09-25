import { artifactPlatform } from "@/platform/artifact";
import { webPlatform } from "@/platform/web";
import type { Platform } from "@/platform/types";

/** True in the standalone-website build (`vite build --mode web`). */
export const IS_WEB = import.meta.env.MODE === "web";

export const platform: Platform = IS_WEB ? webPlatform : artifactPlatform;

export const getImageLimits = () => platform.imageLimits();
