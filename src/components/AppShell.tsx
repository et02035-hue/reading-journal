import { Link } from "@tanstack/react-router";
import { BarChart3, BookMarked, Home, Images, PenLine } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/", label: "홈", icon: Home },
  { to: "/books", label: "내 책", icon: BookMarked },
  { to: "/record", label: "기록", icon: PenLine },
  { to: "/logs", label: "모아보기", icon: Images },
  { to: "/stats", label: "통계", icon: BarChart3 },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="pt-safe px-5 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-md px-5 pb-32">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <ul className="mx-auto flex w-full max-w-md items-stretch pb-safe">
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary font-semibold" }}
              >
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
