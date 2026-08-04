export function watermarkCssVars(opts?: {
  opacity?: number;
  angle?: number;
}): string {
  const opacity = opts?.opacity ?? 0.12;
  const angle = opts?.angle ?? -28;
  return `--wm-opacity:${opacity};--wm-angle:${angle}deg;`;
}
