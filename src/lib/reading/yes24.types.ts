/**
 * YES24 Open API 연동 타입 정의.
 * 서버 함수와 클라이언트 검색 UI가 공유하는 순수 타입.
 */

/** YES24 검색 결과 개별 도서 */
export type Yes24Book = {
  goodsId: string;
  title: string;
  author: string;
  publisher: string;
  publisherUrl?: string | undefined;
  coverUrl?: string | undefined;
  totalPages: number;
  isbn13?: string | undefined;
  yes24Url: string;
  category?: string | undefined;
};

/** 서버 함수가 반환하는 검색 결과 */
export type Yes24SearchResult = {
  books: Yes24Book[];
  error?: string;
};

/** 클라이언트 → 서버 함수에 전달하는 검색 요청 */
export type Yes24SearchRequest = {
  query: string;
};
