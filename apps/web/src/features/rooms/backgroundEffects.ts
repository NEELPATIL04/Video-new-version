// Preset virtual backgrounds. Deliberately generated gradients rather
// than stock photos — no licensing questions, no external image hosting,
// and no network fetch needed (each is a self-contained data: URI).
export interface BackgroundPreset {
  id: string;
  label: string;
  imagePath: string;
}

function gradientSvgDataUri(id: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#${id})"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "sunset", label: "Sunset", imagePath: gradientSvgDataUri("sunset", "#ff9966", "#ff5e62") },
  { id: "ocean", label: "Ocean", imagePath: gradientSvgDataUri("ocean", "#2193b0", "#6dd5ed") },
  { id: "forest", label: "Forest", imagePath: gradientSvgDataUri("forest", "#134e5e", "#71b280") },
  { id: "slate", label: "Slate", imagePath: gradientSvgDataUri("slate", "#485563", "#29323c") },
];
