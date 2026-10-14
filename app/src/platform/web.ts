import { EDIT_FORMAT } from "../model/edit";
import { peaksFromWavFile } from "../model/peaks";
import type { Platform, Session, TextFile } from "./types";

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;
const storageKey = (video: string) => `padel-montage:edit:${video}`;

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");

function readStored(video: string): TextFile | undefined {
  try {
    const text = localStorage.getItem(storageKey(video));
    return text ? { name: `${stem(video)}.padel-edit.json`, text } : undefined;
  } catch {
    return undefined;
  }
}

async function sessionFromFiles(files: File[]): Promise<Session | null> {
  const video = files.find((f) => f.type.startsWith("video/") || VIDEO_EXT.test(f.name));
  if (!video) return null;
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith(".json"));
  let document: TextFile | undefined;
  for (const f of jsons) {
    const text = await f.text();
    // Un montage enregistré l'emporte sur les segments bruts du détecteur.
    if (!document || text.includes(EDIT_FORMAT)) document = { name: f.name, text };
  }
  return {
    name: video.name,
    url: URL.createObjectURL(video),
    document: document ?? readStored(video.name),
    wav: files.find((f) => f.name.toLowerCase().endsWith(".wav")),
  };
}

export const webPlatform: Platform = {
  kind: "web",

  async openSession() {
    return sessionFromFiles(await pickFiles("video/*,.mov,.mkv,.json,.wav", true));
  },

  sessionFromFiles,

  async openDocument() {
    const [f] = await pickFiles(".json,application/json", false);
    return f ? { name: f.name, text: await f.text() } : null;
  },

  async probe() {
    return null;
  },

  async peaks(session, onProgress) {
    return session.wav ? peaksFromWavFile(session.wav, onProgress) : null;
  },

  async saveEdit(session, text, interactive) {
    try {
      localStorage.setItem(storageKey(session.name), text);
    } catch {
      // Stockage plein ou interdit : le téléchargement reste possible.
    }
    if (!interactive) return null;
    const name = `${stem(session.name)}.padel-edit.json`;
    download(name, text);
    return name;
  },

  async saveGroundTruth(session, text) {
    const name = `${stem(session.name)}.verite.json`;
    download(name, text);
    return name;
  },
};
