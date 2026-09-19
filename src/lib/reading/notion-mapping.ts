/**
 * Notion 「읽는 하루 — 독서 기록」 DB 연동용 매핑 레이어.
 *
 * 앱은 이 파일 밖에서 Notion을 전혀 알지 못한다.
 * 나중에 Notion 동기화를 붙일 때는 이 매핑만 재사용하면 된다.
 */
import type { Book, ReadingLogWithBook } from "./types";

/** Notion DB의 속성 이름 (한국어 필드명) */
export const NOTION_LOG_PROPERTIES = {
  title: "제목",
  book: "책",
  author: "저자",
  readDate: "읽은 날짜",
  startPage: "시작 페이지",
  endPage: "끝 페이지",
  pagesRead: "읽은 쪽수",
  quote: "인상 깊은 문장",
  thought: "오늘의 생각",
  pageImage: "페이지 사진",
} as const;

export const NOTION_BOOK_PROPERTIES = {
  title: "제목",
  author: "저자",
  totalPages: "전체 페이지",
  currentPage: "현재 페이지",
  genre: "장르",
  progress: "진행률",
  completed: "완독",
} as const;

/** 앱의 기록 1건 → Notion 페이지 properties 형태 */
export function toNotionLogProperties(log: ReadingLogWithBook, imageUrl?: string | null) {
  const p = NOTION_LOG_PROPERTIES;
  return {
    [p.title]: {
      title: [{ text: { content: `${log.read_date} · ${log.book?.title ?? "제목 없음"}` } }],
    },
    [p.book]: { rich_text: [{ text: { content: log.book?.title ?? "" } }] },
    [p.author]: { rich_text: [{ text: { content: log.book?.author ?? "" } }] },
    [p.readDate]: { date: { start: log.read_date } },
    [p.startPage]: { number: log.start_page },
    [p.endPage]: { number: log.end_page },
    [p.pagesRead]: { number: log.pages_read },
    [p.quote]: { rich_text: [{ text: { content: log.quote ?? "" } }] },
    [p.thought]: { rich_text: [{ text: { content: log.thought ?? "" } }] },
    [p.pageImage]: imageUrl ? { url: imageUrl } : { url: null },
  };
}

/** 앱의 책 1건 → Notion 페이지 properties 형태 */
export function toNotionBookProperties(book: Book) {
  const p = NOTION_BOOK_PROPERTIES;
  const progress = book.total_pages > 0 ? book.current_page / book.total_pages : 0;
  return {
    [p.title]: { title: [{ text: { content: book.title } }] },
    [p.author]: { rich_text: [{ text: { content: book.author ?? "" } }] },
    [p.totalPages]: { number: book.total_pages },
    [p.currentPage]: { number: book.current_page },
    [p.genre]: book.genre ? { select: { name: book.genre } } : { select: null },
    [p.progress]: { number: progress },
    [p.completed]: { checkbox: book.completed },
  };
}
