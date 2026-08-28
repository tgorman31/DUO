"use client";

import type { ReactNode } from "react";
import { CalendarDays, ChevronRight, Dumbbell, Flame, Leaf, Moon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Category, PlannedWeek, Session, TargetTotals } from "@/lib/app-types";

export const categoryMeta: Record<
  Category,
  { label: string; short: string; className: string; icon: typeof Flame }
> = {
  hard: {
    label: "Hard conditioning",
    short: "Hard",
    className: "tone-hard",
    icon: Flame,
  },
  strength: {
    label: "Strength",
    short: "Strength",
    className: "tone-strength",
    icon: Dumbbell,
  },
  easy: {
    label: "Easy aerobic",
    short: "Easy",
    className: "tone-easy",
    icon: Leaf,
  },
  recovery: {
    label: "Rest / recovery",
    short: "Rest",
    className: "tone-recovery",
    icon: Moon,
  },
};

export function formatDay(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatShortDay(date: string) {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "UTC",
    weekday: "narrow",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatRelativeTime(value: string) {
  const date = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - date) / 60_000));
  if (diffMinutes < 2) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function AthleteToggle({
  athletes,
  value,
  onChange,
  includeAll = false,
}: {
  athletes: Array<{ id: string; displayName: string }>;
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  const options = includeAll ? [{ id: "all", displayName: "Both" }, ...athletes] : athletes;
  return (
    <div className="athlete-toggle" role="tablist" aria-label="Athlete selection">
      {options.map((athlete) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === athlete.id}
          className={value === athlete.id ? "athlete-toggle-button athlete-toggle-button-selected" : "athlete-toggle-button"}
          onClick={() => onChange(athlete.id)}
          key={athlete.id}
        >
          {athlete.displayName}
        </button>
      ))}
    </div>
  );
}

export function CategoryBadge({
  category,
  compact = false,
}: {
  category: Category;
  compact?: boolean;
}) {
  const meta = categoryMeta[category];
  const Icon = meta.icon;
  return (
    <span className={cn("category-badge", meta.className, compact && "category-badge-compact")}>
      <Icon aria-hidden="true" />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function TargetBars({
  totals,
  week,
  compact = false,
}: {
  totals: TargetTotals;
  week: PlannedWeek;
  compact?: boolean;
}) {
  const items = [
    { key: "hard" as const, label: "Hard Conditioning", target: week.hardTarget, tone: "target-hard" },
    { key: "strength" as const, label: "Strength", target: week.strengthTarget, tone: "target-strength" },
    { key: "easy" as const, label: "Easy Aerobic", target: week.easyTarget, tone: "target-easy" },
  ];
  return (
    <div className={cn("target-stack", compact && "target-stack-compact")}>
      {items.map((item) => {
        const completed = totals.completed[item.key];
        const percentage = item.target === 0 ? 100 : Math.min(100, (completed / item.target) * 100);
        return (
          <div className="target-row" key={item.key}>
            <div className="target-label">
              <span>{item.label}</span>
              <strong>
                {completed} of {item.target} completed
              </strong>
            </div>
            <Progress
              value={percentage}
              aria-label={`${item.label}: ${completed} of ${item.target} completed`}
              className={cn("target-progress", item.tone)}
            />
          </div>
        );
      })}
    </div>
  );
}

export function WeekStrip({
  sessions,
  selectedDate,
  onSelect,
}: {
  sessions: Session[];
  selectedDate?: string;
  onSelect?: (date: string) => void;
}) {
  const dates = [...new Set(sessions.map((session) => session.scheduledDate))].sort();
  return (
    <div className="week-strip" aria-label="Week overview">
      {dates.map((date) => {
        const items = sessions.filter((session) => session.scheduledDate === date && session.status !== "removed");
        const primary = items[0];
        return (
          <button
            type="button"
            key={date}
            className={cn("week-day", selectedDate === date && "week-day-active")}
            onClick={() => onSelect?.(date)}
            disabled={!onSelect}
            aria-label={`${formatDay(date)}: ${items.map((item) => item.title).join(", ") || "No session"}`}
          >
            <span>{formatShortDay(date)}</span>
            <strong>{new Date(`${date}T00:00:00Z`).getUTCDate()}</strong>
            <i className={primary ? categoryMeta[primary.category].className : "tone-recovery"} />
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CalendarDays aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function MiniLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="mini-link" onClick={onClick}>
      {children}
      <ChevronRight aria-hidden="true" />
    </button>
  );
}
