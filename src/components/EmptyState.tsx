import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-soft flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-primary">{icon}</div> : null}
      <p className="font-reading text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
