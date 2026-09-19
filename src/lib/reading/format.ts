export function formatKoreanDate(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

export function formatMonthTitle(iso: string): string {
  const [y = 1970, m = 1] = iso.split("-").map(Number);
  return `${y}년 ${m}월`;
}
