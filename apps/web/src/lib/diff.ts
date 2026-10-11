export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Line diff of two texts (longest common subsequence). Small inputs only: it is
 * used for a block's rules JSON, which is a few dozen lines.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // lcs[i][j] is the length of the common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      (lcs[i] as number[])[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, (lcs[i] as number[])[j + 1] as number);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] as string });
      i++;
      j++;
    } else if (((lcs[i + 1] as number[])[j] as number) >= ((lcs[i] as number[])[j + 1] as number)) {
      out.push({ kind: 'removed', text: a[i++] as string });
    } else {
      out.push({ kind: 'added', text: b[j++] as string });
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] as string });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] as string });
  return out;
}

export const hasChanges = (diff: DiffLine[]): boolean => diff.some((line) => line.kind !== 'same');
