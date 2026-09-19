import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpen, NotebookPen, PenLine } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { formatKoreanDate } from "@/lib/reading/format";
import { logsQuery, todayPagesQuery } from "@/lib/reading/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "읽는 하루 — 오늘도 한 페이지" },
      {
        name: "description",
        content: "오늘 읽은 쪽수와 최근 독서 기록을 한눈에 확인하세요.",
      },
      { property: "og:title", content: "읽는 하루 — 오늘도 한 페이지" },
      {
        property: "og:description",
        content: "오늘 읽은 쪽수와 최근 독서 기록을 한눈에 확인하세요.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const today = useQuery(todayPagesQuery());
  const logs = useQuery(logsQuery(5));

  return (
    <AppShell title="읽는 하루" subtitle="오늘도 한 페이지">
      <section className="card-soft mt-2 px-6 py-7 text-center">
        <p className="text-sm text-muted-foreground">오늘 읽은 쪽수</p>
        <p className="mt-2 font-reading text-5xl font-bold text-primary">
          {today.isLoading ? "–" : (today.data ?? 0)}
          <span className="ml-1 align-baseline text-lg font-normal text-muted-foreground">
            쪽
          </span>
        </p>
        <Link
          to="/record"
          className="mt-6 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground active:opacity-90"
        >
          ＋ 오늘 읽은 책 기록하기
        </Link>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">최근 기록</h2>
          <Link to="/logs" className="text-sm text-primary">
            모두 보기
          </Link>
        </div>

        {logs.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : (logs.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<NotebookPen className="size-8" strokeWidth={1.5} />}
            title="아직 기록이 없어요"
            description="오늘 읽은 책의 페이지를 찍고 첫 기록을 남겨보세요."
            action={
              <Link
                to="/record"
                className="mt-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                기록하기
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {logs.data!.map((log) => (
              <li key={log.id} className="card-soft px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-reading text-base font-semibold">
                    {log.book?.title ?? "삭제된 책"}
                  </p>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                    {log.pages_read}쪽
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatKoreanDate(log.read_date)} · {log.start_page}–{log.end_page}p
                </p>
                {log.quote ? (
                  <p className="mt-3 border-l-2 border-primary/40 pl-3 font-reading text-sm leading-relaxed text-secondary-foreground">
                    “{log.quote}”
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <Link to="/books" className="card-soft flex items-center gap-4 px-5 py-4">
          <BookOpen className="size-6 text-primary" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold">내 책장</p>
            <p className="text-xs text-muted-foreground">읽고 있는 책과 진행률 보기</p>
          </div>
        </Link>
      </section>
    </AppShell>
  );
}
