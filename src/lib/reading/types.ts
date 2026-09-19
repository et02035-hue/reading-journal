/**
 * 도메인 타입 정의.
 * 저장소(Supabase)와 외부 연동(Notion)에서 공통으로 쓰는 순수 타입만 둔다.
 */

export type Book = {
  id: string;
  title: string;
  author: string | null;
  total_pages: number;
  current_page: number;
  genre: string | null;
  cover_image: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

export type ReadingLog = {
  id: string;
  book_id: string;
  read_date: string;
  start_page: number;
  end_page: number;
  pages_read: number;
  quote: string | null;
  thought: string | null;
  page_image_url: string | null;
  created_at: string;
};

export type ReadingLogWithBook = ReadingLog & {
  book: Pick<Book, "id" | "title" | "author"> | null;
};

export type NewBookInput = {
  title: string;
  author?: string;
  total_pages?: number;
  genre?: string;
};

export type NewReadingLogInput = {
  book_id: string;
  read_date: string;
  start_page: number;
  end_page: number;
  quote?: string;
  thought?: string;
  page_image_url?: string | null;
};

/** 책 진행률(%) */
export function progressOf(book: Pick<Book, "current_page" | "total_pages">): number {
  if (!book.total_pages || book.total_pages <= 0) return 0;
  return Math.min(100, Math.round((book.current_page / book.total_pages) * 100));
}

/** 읽은 쪽수 (DB에서도 동일 규칙으로 자동 계산된다) */
export function pagesReadOf(startPage: number, endPage: number): number {
  return endPage - startPage + 1;
}
