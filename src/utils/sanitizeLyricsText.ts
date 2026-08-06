export const sanitizeLyricsText = (lyrics: string): string => {
  return lyrics
    .split('\n')
    .map(line =>
      line
        .replace(/[\t\r]+/g, '')
        .replace(/\u3000/g, ' ')
        .trim()
    )
    .join('\n');
};
