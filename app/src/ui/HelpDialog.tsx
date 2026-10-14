// Aide-mémoire des raccourcis.

import { useEffect } from "react";
import { Icon } from "./icons";

const GROUPS: [string, [string, string][]][] = [
  [
    "Lecture",
    [
      ["Espace", "Lecture / pause"],
      ["M", "Rush complet ou montage seul"],
      ["L", "Lire, puis accélérer"],
      ["J", "Revenir 3 s en arrière"],
      ["← →", "Image précédente / suivante"],
      ["Maj + ← →", "Une seconde"],
    ],
  ],
  [
    "Points",
    [
      ["↑ ↓", "Point précédent / suivant"],
      ["I / O", "Début / fin du point ici"],
      ["C", "Couper le point ici"],
      ["N", "Nouveau point ici"],
      ["K", "Sans intérêt : hors montage, compté au score"],
      ["Suppr", "Pas un point : le supprimer"],
      ["Début / Fin", "Aller au bord du point"],
    ],
  ],
  [
    "Timeline",
    [
      ["Glisser un bord", "Ajuster début ou fin"],
      ["Glisser un point", "Le décaler dans le rush"],
      ["Double-clic", "Nouveau point"],
      ["Ctrl + molette", "Zoomer"],
      ["+ / −  ·  F", "Zoomer · tout le match"],
      ["A  ·  Alt", "Aimantation · l'ignorer"],
      ["Ctrl + Z", "Annuler (Maj pour rétablir)"],
    ],
  ],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog help" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header>
          <h2 id="help-title">Raccourcis</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </header>
        <div className="help-grid">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3>{title}</h3>
              <dl>
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
