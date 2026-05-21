export const getVersionParts = (label: string) => label.split('.').map((part) => Number(part));

export const compareVersionLabelsDesc = (a: string, b: string) => {
  const aParts = getVersionParts(a);
  const bParts = getVersionParts(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (bParts[index] ?? 0) - (aParts[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
};
