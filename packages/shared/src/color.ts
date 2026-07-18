export const defaultUserAnnotationColor = '#f4c95d';

export function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  const normalizedHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : defaultUserAnnotationColor;
  const red = Number.parseInt(normalizedHex.slice(1, 3), 16);
  const green = Number.parseInt(normalizedHex.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedHex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
