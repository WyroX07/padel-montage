// Écran d'accueil : ouvrir un rush.

import { Icon } from "./icons";

export function Welcome({ onOpen, kind }: { onOpen(): void; kind: "desktop" | "web" }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <svg className="welcome-logo" width="44" height="44" viewBox="0 0 22 22" aria-hidden>
          <circle cx="11" cy="11" r="9" fill="var(--accent)" />
          <path d="M4.2 7.2c3.6 1 5.6 4.1 5.2 8.6M17.8 14.8c-3.6-1-5.6-4.1-5.2-8.6" stroke="#14160c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
        <h1>Padel Montage</h1>
        <p className="lead">Ouvrez le rush d'un match : les points trouvés par le détecteur s'affichent sur la timeline, vous ajustez, et le montage est prêt.</p>
        <button className="btn primary large" onClick={onOpen}>
          <Icon name="folder" />
          Ouvrir un rush
        </button>
        <p className="hint">
          {kind === "desktop"
            ? "Ou déposez la vidéo ici. Si un fichier de points du détecteur porte le même nom à côté, il est chargé tout seul."
            : "Ou déposez ici la vidéo, avec son fichier de points (.json) et son audio (.wav) pour la forme d'onde."}
        </p>
        <p className="kbd-hint">
          <kbd>?</kbd> raccourcis clavier
        </p>
      </div>
    </div>
  );
}
