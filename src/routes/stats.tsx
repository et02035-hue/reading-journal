import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { monthlyStatsQuery } from "@/lib/reading/queries";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "독서 통계 — 읽는 하루" },
      { name: "description", content: "이번 달 읽은 쪽수, 독서일 수, 완독한 책 수." },
      { property: "og:title", content: "독서 통계 — 읽는 하루" },
      {
        property: "og:description",
        content: "이번 달 읽은 쪽수, 독서일 수, 완독한 책 수.",
      },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const stats = useQuery(monthlyStatsQuery());
  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  const cards = [
    { label: "이번 달 읽은 쪽수", value: stats.data?.pages ?? 0, unit: "쪽" },
    { label: "독서한 날", value: stats.data?.days ?? 0, unit: "일" },
    { label: "완독한 책", value: stats.data?.completedBooks ?? 0, unit: "권" },
    { label: "남긴 기록", value: stats.data?.logCount ?? 0, unit: "개" },
  ];

  return (
    <AppShell title="독서 통계" subtitle={monthLabel}>
      {stats.isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="card-soft px-5 py-6 text-center">
              <p className="font-reading text-3xl font-bold text-primary">
                {c.value}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {c.unit}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {!stats.isLoading && (stats.data?.logCount ?? 0) === 0 ? (
        <p className="mt-6 rounded-2xl bg-muted px-5 py-4 text-center text-sm text-muted-foreground">
          이번 달 기록이 아직 없어요. 오늘 한 페이지부터 시작해 볼까요?
        </p>
      ) : null}
    </AppShell>
  );
}
