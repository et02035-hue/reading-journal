import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink, Loader2, Search } from "lucide-react";
import { useState } from "react";

import { genreFromYes24Book, searchYes24Books } from "@/lib/reading/yes24.functions";
import type { Yes24Book } from "@/lib/reading/yes24.types";

export type SelectedYes24Book = {
  title: string;
  author: string;
  totalPages: number;
  genre: string;
  coverUrl: string;
  publisher: string;
  isbn13: string;
  yes24Url: string;
};

export function BookSearch({
  onSelect,
  onManualFallback,
}: {
  onSelect: (book: SelectedYes24Book) => void;
  onManualFallback: () => void;
}) {
  const callSearch = useServerFn(searchYes24Books);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Yes24Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setHasSearched(true);

    try {
      const res = await callSearch({ data: { query: trimmed } });
      if (res.error) {
        setError(res.error);
        setResults([]);
      } else {
        setResults(res.books);
        if (res.books.length === 0) {
          setError("검색 결과가 없어요. 직접 입력할 수 있어요.");
        }
      }
    } catch {
      setError("검색 중 오류가 발생했어요. 직접 입력할 수 있어요.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(book: Yes24Book) {
    onSelect({
      title: book.title,
      author: book.author,
      totalPages: book.totalPages,
      genre: genreFromYes24Book(book),
      coverUrl: book.coverUrl ?? "",
      publisher: book.publisher,
      isbn13: book.isbn13 ?? "",
      yes24Url: book.yes24Url,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          placeholder="책 제목을 검색하세요"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-60"
          aria-label="검색"
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
        </button>
      </div>

      {error ? (
        <div className="space-y-2">
          <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={onManualFallback}
            className="text-sm font-medium text-primary"
          >
            직접 입력하기
          </button>
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((book) => (
            <li key={book.goodsId}>
              <button
                type="button"
                onClick={() => handleSelect(book)}
                className="card-soft flex w-full gap-3 p-3 text-left active:opacity-80"
              >
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="size-16 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <BookOpen className="size-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{book.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {book.author || "저자 미상"}
                    {book.publisher ? ` · ${book.publisher}` : ""}
                  </p>
                  {book.totalPages > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{book.totalPages}쪽</p>
                  ) : null}
                  {book.yes24Url ? (
                    <a
                      href={book.yes24Url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
                    >
                      YES24 <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hasSearched && !loading && results.length === 0 && !error ? (
        <button
          type="button"
          onClick={onManualFallback}
          className="text-sm font-medium text-primary"
        >
          직접 입력하기
        </button>
      ) : null}
    </div>
  );
}
