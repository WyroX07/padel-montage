import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Peaks } from "../model/peaks";
import { PEAK_BIN_MS } from "../model/peaks";
import type { Platform, Session, TextFile, VideoInfo } from "./types";

const VIDEO_EXT = ["mp4", "mov", "m4v", "mkv", "avi", "MP4", "MOV"];

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const stemOf = (path: string) => path.replace(/\.[^.\\/]+$/, "");

interface Companions {
  document: TextFile | null;
}

async function sessionFromPath(path: string): Promise<Session> {
  const found = await invoke<Companions>("companions", { video: path });
  return {
    name: baseName(path),
    path,
    url: convertFileSrc(path),
    document: found.document ?? undefined,
  };
}

function progressChannel(onProgress?: (f: number) => void) {
  const ch = new Channel<number>();
  ch.onmessage = (f) => onProgress?.(f);
  return ch;
}

export const desktopPlatform: Platform = {
  kind: "desktop",

  async openSession() {
    const path = await open({
      title: "Ouvrir un rush",
      multiple: false,
      directory: false,
      filters: [{ name: "Vidéo", extensions: VIDEO_EXT }],
    });
    return typeof path === "string" ? sessionFromPath(path) : null;
  },

  onDrop(handler) {
    const pending = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop") return;
      const video = e.payload.paths.find((p) => VIDEO_EXT.includes(p.split(".").pop() ?? ""));
      if (video) void sessionFromPath(video).then(handler);
    });
    return () => void pending.then((un) => un());
  },

  async openDocument() {
    const path = await open({
      title: "Importer des points",
      multiple: false,
      filters: [{ name: "Points détectés ou montage", extensions: ["json"] }],
    });
    if (typeof path !== "string") return null;
    const text = await invoke<string>("read_text", { path });
    return { name: baseName(path), path, text };
  },

  async probe(session) {
    if (!session.path) return null;
    return invoke<VideoInfo>("probe_video", { video: session.path });
  },

  async peaks(session, onProgress): Promise<Peaks | null> {
    if (!session.path) return null;
    const buf = await invoke<ArrayBuffer>("audio_peaks", {
      video: session.path,
      binMs: PEAK_BIN_MS,
      onProgress: progressChannel(onProgress),
    });
    return { binMs: PEAK_BIN_MS, values: new Uint8Array(buf) };
  },

  async saveEdit(session, text, interactive) {
    if (!session.path) return null;
    let path = `${stemOf(session.path)}.padel-edit.json`;
    if (interactive) {
      const chosen = await save({
        title: "Enregistrer le montage",
        defaultPath: path,
        filters: [{ name: "Montage", extensions: ["json"] }],
      });
      if (!chosen) return null;
      path = chosen;
    }
    await invoke("write_text", { path, text });
    return path;
  },

  async saveGroundTruth(session, text) {
    const path = await save({
      title: "Exporter en vérité terrain",
      defaultPath: session.path ? `${stemOf(session.path)}.verite.json` : "verite.json",
      filters: [{ name: "padel-rallies/v1", extensions: ["json"] }],
    });
    if (!path) return null;
    await invoke("write_text", { path, text });
    return path;
  },

  async makeProxy(session, onProgress) {
    if (!session.path) throw new Error("Rush sans chemin sur le disque.");
    const proxy = await invoke<string>("make_proxy", {
      video: session.path,
      onProgress: progressChannel(onProgress),
    });
    return convertFileSrc(proxy);
  },

  async exportMontage(session, clips, onProgress) {
    if (!session.path) return null;
    const out = await save({
      title: "Exporter le montage",
      defaultPath: `${stemOf(session.path)}_montage.mp4`,
      filters: [{ name: "Vidéo MP4", extensions: ["mp4"] }],
    });
    if (!out) return null;
    await invoke("export_montage", {
      video: session.path,
      clips,
      out,
      onProgress: progressChannel(onProgress),
    });
    return out;
  },

  async cancelJob() {
    await invoke("cancel_job");
  },

  async reveal(path) {
    await revealItemInDir(path);
  },
};

