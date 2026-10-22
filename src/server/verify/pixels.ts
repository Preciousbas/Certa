import { averageHash } from "@certa/shared";

export function meanLuma(gray: Uint8Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (const value of gray) sum += value;
  return sum / gray.length;
}

export function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let count = 0;
  let sum = 0;
  let squares = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const value =
        (gray[index - width] ?? 0) +
        (gray[index + width] ?? 0) +
        (gray[index - 1] ?? 0) +
        (gray[index + 1] ?? 0) -
        4 * (gray[index] ?? 0);
      sum += value;
      squares += value * value;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return squares / count - mean * mean;
}

export function averageHashOf(gray: Uint8Array, width: number, height: number): string {
  return averageHash(gray, width, height);
}
