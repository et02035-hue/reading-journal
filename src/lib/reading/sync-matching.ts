/**
 * Notion 기록 ↔ Supabase 기록 매칭 규칙 (순수 함수).
 * 중복 생성을 막는 판단 기준을 한곳에 모아둔다.
 */

export function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** 날짜 + 책 제목 + 시작/끝 페이지로 만드는 1:1 매칭 키 */
export function logMatchKey(input: {
  readDate: string;
  bookTitle: string | null | undefined;
  startPage: number;
  endPage: number;
}): string {
  return [
    input.readDate,
    normalizeTitle(input.bookTitle),
    input.startPage,
    input.endPage,
  ].join("|");
}

/** 책 매칭 키 (제목 + 저자). 저자가 없으면 제목만으로 비교한다. */
export function bookMatchKey(title: string, author: string | null | undefined): string {
  return `${normalizeTitle(title)}|${normalizeTitle(author)}`;
}

export function pagesReadBetween(startPage: number, endPage: number): number {
  return Math.max(0, endPage - startPage + 1);
}
