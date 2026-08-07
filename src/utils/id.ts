export const generateUUID = (prefix: string = '', length = 8): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return (prefix ? `${prefix}_` : '') + crypto.randomUUID().slice(0, length);
  }

  const randomStr = Math.random()
    .toString(36)
    .substring(2, 2 + length);
  const timeStr = Date.now().toString(36).slice(-4);
  return (prefix ? `${prefix}_` : '') + (randomStr + timeStr).slice(0, length);
};
