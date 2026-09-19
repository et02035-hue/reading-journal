import { queryOptions } from "@tanstack/react-query";

import { getMonthlyStats, getTodayPages, listBooks, listLogs } from "./api";

export const readingKeys = {
  books: ["books"] as const,
  logs: (limit?: number) => ["logs", limit ?? "all"] as const,
  todayPages: ["today-pages"] as const,
  monthlyStats: ["monthly-stats"] as const,
};

export const booksQuery = () =>
  queryOptions({ queryKey: readingKeys.books, queryFn: listBooks });

export const logsQuery = (limit?: number) =>
  queryOptions({ queryKey: readingKeys.logs(limit), queryFn: () => listLogs(limit) });

export const todayPagesQuery = () =>
  queryOptions({ queryKey: readingKeys.todayPages, queryFn: getTodayPages });

export const monthlyStatsQuery = () =>
  queryOptions({ queryKey: readingKeys.monthlyStats, queryFn: () => getMonthlyStats() });
