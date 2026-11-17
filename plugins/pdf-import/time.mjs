// Stable Korean time, independent of the machine's timezone.
export function koreanTime(value = new Date(), dateOnly = false) {
  const local = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const text = local.toISOString();
  return dateOnly ? text.slice(0, 10) : text.slice(0, 19).replace('T', ' ');
}
