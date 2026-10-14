import { toBlob } from "html-to-image";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Scorebug, type ScorebugProps } from "./Scorebug";

export interface RenderOptions {
  /** Multiplie la résolution (2 pour un rendu net si `size` est petit). Défaut : 1. */
  pixelRatio?: number;
}

/**
 * Rend l'overlay en PNG transparent, à la taille exacte du bandeau (sans marge).
 * À appeler dans la webview de l'appli : il faut un DOM et les polices chargées.
 * `size` en pixels fixe la taille, par exemple 28 pour une vidéo 1080p.
 */
export async function renderScorebugPng(props: ScorebugProps, options: RenderOptions = {}): Promise<Blob> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Scorebug {...props} animate={false} />));
    await document.fonts.ready;
    const node = host.firstElementChild as HTMLElement;
    const blob = await toBlob(node, { pixelRatio: options.pixelRatio ?? 1, cacheBust: false });
    if (!blob) throw new Error("Le rendu de l'overlay a échoué.");
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}
