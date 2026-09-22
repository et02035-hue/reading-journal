/**
 * YES24 도서 검색 서버 함수.
 * YES24_API_KEY는 서버 Secret에서만 읽어오며 클라이언트에 노출되지 않는다.
 */
import { createServerFn } from "@tanstack/react-start";

import { mapYes24CategoryToGenre } from "./yes24-genre";
import type { Yes24Book, Yes24SearchRequest, Yes24SearchResult } from "./yes24.types";

const YES24_API_BASE = "https://apis.yes24.com/v1/goods/itemList";

type Yes24ApiItem = {
  itemId?: number | string;
  title?: string;
  author?: string;
  publisher?: string;
  goodsSortNm?: string;
  pages?: number | null;
  isbn13?: string;
  cover?: string;
  link?: string;
};

type Yes24ApiResponse = {
  success?: boolean;
  message?: string;
  errorCode?: string | null;
  data?: {
    items?: Yes24ApiItem[];
  } | null;
};

/** YES24 저자 표기("홍길동 저" / "홍길동 지음")에서 접미어를 걷어낸다. */
function cleanAuthor(raw?: string): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed.replace(/\s+(저|지음|역|옮긴이)$/, "").trim();
}

export const searchYes24Books = createServerFn({ method: "GET" })
  .inputValidator((data: Yes24SearchRequest) => {
    if (!data.query || !data.query.trim()) {
      throw new Error("검색어를 입력해 주세요.");
    }
    return { query: data.query.trim() };
  })
  .handler(async ({ data }): Promise<Yes24SearchResult> => {
    const apiKey = process.env["YES24_API_KEY"];
    if (!apiKey) {
      return {
        books: [],
        error: "YES24 API Key가 설정되지 않았습니다. Bolt Secrets에서 YES24_API_KEY를 등록해 주세요.",
      };
    }

    try {
      const params = new URLSearchParams({
        query: data.query,
        page: "1",
        pageSize: "10",
        detail: "Y",
      });

      const response = await fetch(`${YES24_API_BASE}?${params.toString()}`, {
        method: "GET",
        headers: {
          "X-Api-Key": apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`YES24 API error [${response.status}]: ${body}`);
        return {
          books: [],
          error: `YES24 검색에 실패했습니다. (상태: ${response.status})`,
        };
      }

    const json = (await response.json()) as Yes24ApiResponse;

    if (json.success === false) {
      return {
        books: [],
        error: json.message ?? "YES24 API에서 오류를 반환했습니다.",
      };
    }

    const items = json.data?.items ?? [];
    const books: Yes24Book[] = items.map((item) => ({
      goodsId: String(item.itemId ?? ""),
      title: item.title?.trim() || "제목 없음",
      author: cleanAuthor(item.author),
      publisher: item.publisher?.trim() ?? "",
      coverUrl: item.cover,
      totalPages: item.pages ?? 0,
      isbn13: item.isbn13,
      yes24Url: item.link ?? "",
      category: item.goodsSortNm,
    }));

      return { books };
    } catch (error) {
      console.error("YES24 search error", error);
      return {
        books: [],
        error: "YES24에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  });

/** YES24 검색 결과에서 장르를 추정하여 앱 장르로 매핑 */
export function genreFromYes24Book(book: Yes24Book): string {
  return mapYes24CategoryToGenre(book.category);
}
