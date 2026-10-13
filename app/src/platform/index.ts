import { isTauri } from "@tauri-apps/api/core";
import { desktopPlatform } from "./desktop";
import type { Platform } from "./types";
import { webPlatform } from "./web";

export const platform: Platform = isTauri() ? desktopPlatform : webPlatform;
export type * from "./types";
