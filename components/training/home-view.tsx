"use client";

import { ArrowRight, CalendarDays, Clock3, MapPin, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppData, AppRoute, MainView } from "@/lib/app-types";
import {
  CategoryBadge,
  formatDay,
  formatRelativeTime,
  SectionHeading,
  TargetBars,
  WeekStrip,
} from "./common";

export function HomeView({
  data,
  onNavigate,
}: {
  data: AppData;
  onNavigate: (view: MainView, details?: Partial<AppRoute>) => void;
}) {
  const mySessions = data.sessions.filter(
    (session) => session.athleteId === data.actor.id && session.status !== "removed",
  );
  const isWeekSet = Boolean(data.week.confirmedAt);
  const todayRest = mySessions.find(
    (session) =>
      session.status === "planned" &&
      session.scheduledDate === data.serverDate &&
      session.category === "recovery",
  );
  const next =
    mySessions.find(
      (session) =>
        session.status === "planned" &&
        session.category !== "recovery" &&
        session.scheduledDate >= data.serverDate,
    ) ?? mySessions.find((session) => session.status === "planned" && session.category !== "recovery");
  const totals = data.totals[data.actor.id];
  const races = data.events.filter((event) => event.eventType.toLowerCase().includes("hyrox"));
  const partnerFeed = data.feed.filter((item) => item.athleteId !== data.actor.id).slice(0, 3);

  return (
    <div className="view-stack home-view">
      <section className="next-session-card">
        <div className="next-session-glow" />
        <div className="next-session-topline">
          <span className="live-kicker">
            <i /> {!isWeekSet ? "Recommended this week" : todayRest ? "Today" : "Next session"}
          </span>
          {!isWeekSet ? <span className="system-status-badge">Not set</span> : todayRest ? <CategoryBadge category="recovery" compact /> : next ? <CategoryBadge category={next.category} compact /> : null}
        </div>
        {!isWeekSet ? (
          <>
            <p className="next-session-date">{data.phase?.name ?? "Training block"}</p>
            <h1>{data.week.title}</h1>
            <p className="next-session-details">{data.week.rationale}</p>
            <div className="recommended-target-summary" aria-label="Recommended weekly targets">
              <span>Hard <strong>{data.week.hardTarget}</strong></span>
              <span>Strength <strong>{data.week.strengthTarget}</strong></span>
              <span>Easy <strong>{data.week.easyTarget}</strong></span>
            </div>
            <Button className="start-session-button" onClick={() => onNavigate("week")}>Plan this week <ArrowRight aria-hidden="true" /></Button>
          </>
        ) : todayRest ? (
          <>
            <p className="next-session-date">{formatDay(todayRest.scheduledDate)}</p>
            <h1>Rest / Recovery</h1>
            <p className="next-session-details">No structured training planned today. Recover, adapt and make the next actual session count.</p>
            {next ? (
              <div className="rest-next-session">
                <span>Next training session</span>
                <strong>{formatDay(next.scheduledDate)} — {next.title}</strong>
              </div>
            ) : null}
            {next ? (
              <Button className="start-session-button" onClick={() => onNavigate("train")}>View next training <ArrowRight aria-hidden="true" /></Button>
            ) : null}
          </>
        ) : next ? (
          <>
            <p className="next-session-date">{formatDay(next.scheduledDate)}</p>
            <h1>{next.title}</h1>
            <p className="next-session-details">{next.details}</p>
            <div className="next-session-meta">
              <span>
                <Users aria-hidden="true" />
                {next.assignment === "together" ? `Together with ${data.partner?.displayName ?? "partner"}` : `${data.actor.displayName}'s plan`}
              </span>
              <span>
                <Clock3 aria-hidden="true" /> Planned
              </span>
            </div>
            <Button className="start-session-button" onClick={() => onNavigate("train", { sessionId: next.id, mode: "log" })}>
              Open workout
              <ArrowRight aria-hidden="true" />
            </Button>
          </>
        ) : (
          <>
            <h1>Week complete</h1>
            <p className="next-session-details">No planned sessions remain in this week.</p>
            <Button className="start-session-button" onClick={() => onNavigate("week")}>
              Review the week
              <ArrowRight aria-hidden="true" />
            </Button>
          </>
        )}
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <article className="performance-card week-overview-card">
          <SectionHeading
            eyebrow={data.phase?.name ?? "Training block"}
            title={data.week.title}
            action={
              <button className="text-action" type="button" onClick={() => onNavigate("week")}>
                Open week
              </button>
            }
          />
          <p className="supporting-copy">{data.week.rationale}</p>
          {isWeekSet ? <WeekStrip sessions={mySessions} /> : (
            <div className="recommended-week-list">
              {data.originalPlan.slice(0, 4).map((session) => <div key={session.id}><i className={`tone-dot tone-${session.category}`} /><span><strong>{formatDay(session.scheduledDate)}</strong><small>{session.title}</small></span></div>)}
            </div>
          )}
          <div className="week-status-line">
            <span>
              <CalendarDays aria-hidden="true" /> W/C {formatDay(data.week.startDate, { weekday: undefined })}
            </span>
            <span className={data.week.confirmedAt ? "status-set" : "status-draft"}>
              {data.week.confirmedAt ? "Shared week set" : "Recommendation · not set"}
            </span>
          </div>
        </article>

        <article className="performance-card targets-card">
          <SectionHeading eyebrow={isWeekSet ? "Objectives, not obedience" : "Recommended defaults"} title="Weekly targets" />
          {isWeekSet ? <TargetBars totals={totals} week={data.week} /> : (
            <div className="recommended-target-list">
              <div><span>Hard Conditioning</span><strong>{data.week.hardTarget}</strong></div>
              <div><span>Strength</span><strong>{data.week.strengthTarget}</strong></div>
              <div><span>Easy Aerobic</span><strong>{data.week.easyTarget}</strong></div>
            </div>
          )}
          <div className="target-note">
            <Target aria-hidden="true" />
            <span>{isWeekSet ? "Moved or replaced sessions still count when the intended category is completed." : "These targets do not become agreed objectives until the shared week is set."}</span>
          </div>
        </article>
      </section>

      <section>
        <SectionHeading
          eyebrow="Finish line radar"
          title="Race countdowns"
          action={
            <button className="text-action" type="button" onClick={() => onNavigate("events")}>
              All events
            </button>
          }
        />
        <div className="race-grid">
          {races.map((event) => (
            <button className="race-countdown-card" key={event.id} type="button" onClick={() => onNavigate("events")}>
              <div>
                <span>{event.label}</span>
                <h3>{event.name}</h3>
                <p>
                  <MapPin aria-hidden="true" /> {event.location}
                </p>
              </div>
              <div className="countdown-number">
                <strong>{Math.abs(event.daysAway)}</strong>
                <span>{event.daysAway >= 0 ? "days" : "days ago"}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="performance-card partner-pulse-card">
        <SectionHeading
          eyebrow="Partner pulse"
          title={partnerFeed.length ? `${data.partner?.displayName ?? "Partner"}'s latest` : "Shared activity"}
          action={
            <button className="text-action" type="button" onClick={() => onNavigate("feed")}>
              Open feed
            </button>
          }
        />
        {partnerFeed.length ? (
          <div className="mini-feed">
            {partnerFeed.map((item) => (
              <div className="mini-feed-item" key={item.id}>
                <div className="athlete-monogram">{item.athleteName.slice(0, 1)}</div>
                <div>
                  <p>{item.message}</p>
                  <span>{formatRelativeTime(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="supporting-copy">Completed sessions and plan changes will appear here for both athletes.</p>
        )}
      </section>
    </div>
  );
}
