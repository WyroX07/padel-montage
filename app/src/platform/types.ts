// Ce que l'éditeur demande à son hôte. Deux implémentations :
// - desktop : l'appli Tauri (fichiers locaux, FFmpeg) ;
// - web : un navigateur, pour développer et essayer l'éditeur sans compiler l'appli.

import type { Peaks } from "../model/peaks";

export interface TextFile {
  name: string;
  text: string;
  path?: string;
}

export interface Session {
  name: string;
  /** Chemin du rush sur le disque (appli de bureau seulement). */
  path?: string;
  /** Adresse lisible par la balise <video>. */
  url: string;
  /** Montage déjà enregistré pour ce rush, sinon segments du détecteur. */
  document?: TextFile;
  /** Navigateur : WAV choisi avec la vidéo, pour la forme d'onde. */
  wav?: Blob;
}

export interface VideoInfo {
  durationMs: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  /** La WebView sait-elle lire ce codec ? Sinon on prépare un aperçu. */
  playable: boolean;
}

export interface ClipRange {
  start: number;
  end: number;
}

export type Progress = (fraction: number) => void;

export interface Platform {
  kind: "desktop" | "web";
  /** Ouvre un rush (et, dans le navigateur, ses fichiers compagnons choisis en même temps). */
  openSession(): Promise<Session | null>;
  /** Fichiers déposés sur la fenêtre (navigateur). */
  sessionFromFiles?(files: File[]): Promise<Session | null>;
  /** Rush déposé sur la fenêtre (bureau) ; renvoie de quoi arrêter l'écoute. */
  onDrop?(handler: (session: Session) => void): () => void;
  /** Choisit un fichier de segments ou de montage. */
  openDocument(): Promise<TextFile | null>;
  probe(session: Session): Promise<VideoInfo | null>;
  peaks(session: Session, onProgress?: Progress): Promise<Peaks | null>;
  /** Enregistre le montage à côté du rush (bureau) ou le télécharge (navigateur). */
  saveEdit(session: Session, text: string, interactive: boolean): Promise<string | null>;
  saveGroundTruth(session: Session, text: string): Promise<string | null>;
  /** Prépare une copie légère lisible par la WebView ; renvoie la nouvelle adresse. */
  makeProxy?(session: Session, onProgress?: Progress): Promise<string>;
  /** Assemble les points dans l'ordre du montage ; renvoie le chemin du fichier écrit. */
  exportMontage?(session: Session, clips: ClipRange[], onProgress?: Progress): Promise<string | null>;
  cancelJob?(): Promise<void>;
  reveal?(path: string): Promise<void>;
}
