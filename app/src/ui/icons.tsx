// Icônes dessinées pour l'appli (trait 1,6 px sur une grille de 20).

import type { SVGProps } from "react";

const paths = {
  play: <path d="M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.4-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="5.5" y="4.5" width="3" height="11" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="11.5" y="4.5" width="3" height="11" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  prev: <path d="M14.5 5 8 10l6.5 5M5.5 5v10" />,
  next: <path d="M5.5 5 12 10l-6.5 5M14.5 5v10" />,
  cut: (
    <>
      <circle cx="6" cy="14.5" r="2.2" />
      <circle cx="14" cy="14.5" r="2.2" />
      <path d="M7.6 12.9 14.5 3.5M12.4 12.9 5.5 3.5" />
    </>
  ),
  trash: <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.3a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6" />,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  inPoint: <path d="M7 4.5v11M7 4.5h3M7 15.5h3M10.5 10H16M13.5 7.5 16 10l-2.5 2.5" />,
  outPoint: <path d="M13 4.5v11M13 4.5h-3M13 15.5h-3M9.5 10H4M6.5 7.5 4 10l2.5 2.5" />,
  undo: <path d="M7.5 8H13a3.5 3.5 0 0 1 0 7h-3M7.5 8l3-3M7.5 8l3 3" />,
  redo: <path d="M12.5 8H7a3.5 3.5 0 0 0 0 7h3M12.5 8l-3-3M12.5 8l-3 3" />,
  magnet: <path d="M5 4.5v5.5a5 5 0 0 0 10 0V4.5M5 7.5h3M12 7.5h3M8 4.5v5.5a2 2 0 0 0 4 0V4.5" />,
  fit: <path d="M4 7V4.5h2.5M16 7V4.5h-2.5M4 13v2.5h2.5M16 13v2.5h-2.5M7.5 10h5" />,
  zoomIn: (
    <>
      <circle cx="9" cy="9" r="4.8" />
      <path d="m12.5 12.5 3.5 3.5M9 6.8v4.4M6.8 9h4.4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="9" cy="9" r="4.8" />
      <path d="m12.5 12.5 3.5 3.5M6.8 9h4.4" />
    </>
  ),
  folder: <path d="M3.5 6.5v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H10L8.5 5h-4a1 1 0 0 0-1 1.5Z" />,
  importFile: <path d="M10 3.5v8.5M6.8 8.8 10 12l3.2-3.2M4.5 13v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />,
  exportFile: <path d="M10 12.5V4M6.8 7.2 10 4l3.2 3.2M4.5 13v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />,
  save: <path d="M5 4h8l2.5 2.5V15a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM7 4v3.5h5V4M7 16v-4.5h6V16" />,
  grip: (
    <>
      <circle cx="7.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sort: <path d="M6 4.5v11M3.5 13 6 15.5 8.5 13M11 6h5.5M11 10h4M11 14h2.5" />,
  keyboard: <path d="M3.5 6.5h13v8h-13zM6 9h.01M8.5 9h.01M11 9h.01M13.5 9h.01M7 12h6" />,
  close: <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />,
  volume: <path d="M4 8h2.5L10 5v10l-3.5-3H4ZM13 7.5a3.5 3.5 0 0 1 0 5M14.8 5.5a6 6 0 0 1 0 9" />,
  mute: <path d="M4 8h2.5L10 5v10l-3.5-3H4ZM13 8l4 4M17 8l-4 4" />,
  film: <path d="M4 4.5h12v11H4zM7 4.5v11M13 4.5v11M4 8h3M4 12h3M13 8h3M13 12h3" />,
  wave: <path d="M3 10h1.5M6 7v6M8.5 4.5v11M11 8v4M13.5 6v8M16 9v2" />,
  check: <path d="m5 10.5 3.2 3.2L15 6.5" />,
  eye: (
    <>
      <path d="M2.8 10s2.6-5 7.2-5 7.2 5 7.2 5-2.6 5-7.2 5-7.2-5-7.2-5Z" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
  eyeOff: <path d="M4 4l12 12M8.2 5.3A7 7 0 0 1 10 5c4.6 0 7.2 5 7.2 5a12 12 0 0 1-2 2.6M12.6 14.5A6.6 6.6 0 0 1 10 15c-4.6 0-7.2-5-7.2-5a12 12 0 0 1 2.6-3.1M8.4 8.4a2.2 2.2 0 0 0 3.2 3.2" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
