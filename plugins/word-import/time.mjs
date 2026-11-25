// Stable Korean time, independent of the machine's timezone.
export function koreanTime(value = new Date(), dateOnly = false) {
  const local = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const text = local.toISOString();
  return dateOnly ? text.slice(0, 10) : text.slice(0, 19).replace('T', ' ');
}

// The recent list receives a timestamp already expressed in Korean time.
export function recentDate(value, now = Date.now()) {
  const today = koreanTime(now, true);
  const date = value.slice(0, 10);
  if (date === today) return `오늘 ${value.slice(11, 16)}`;
  if (date === koreanTime(now - 86_400_000, true)) return "어제";
  const [year, month, day] = date.split("-").map(Number);
  const yearLabel = date.slice(0, 4) === today.slice(0, 4) ? "" : `${year}년 `;
  return `${yearLabel}${month}월 ${day}일`;
}
