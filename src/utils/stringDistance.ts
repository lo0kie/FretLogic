export const getEditDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 让较短的字符串对应数组宽度，这样空间占用取两者中较小的一个
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  const prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diag = prevRow[0]; // 相当于原来 matrix[i-1][0]
    prevRow[0] = i; // 变成当前行的 matrix[i][0]

    for (let j = 1; j <= b.length; j++) {
      const temp = prevRow[j]; // 先存住 matrix[i-1][j]，等下要被覆盖
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prevRow[j] = Math.min(
        temp + 1, // matrix[i-1][j] + 1（上方）
        prevRow[j - 1] + 1, // matrix[i][j-1] + 1（左方，这一步已经是本行算好的新值）
        diag + cost // matrix[i-1][j-1] + cost（左上方）
      );
      diag = temp; // 下一轮循环里，diag 要变成这一轮的 temp
    }
  }

  return prevRow[b.length];
};
