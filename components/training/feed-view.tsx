"use client";

import { useState } from "react";
import { Activity, Dumbbell, Flame, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppData, FeedItem, Mutate } from "@/lib/app-types";
import { AthleteToggle, formatRelativeTime, SectionHeading } from "./common";

const reactions = ["❤️", "👍", "🔥", "💦"];

function ActivityIcon({ type }: { type: string }) {
  if (type === "completion") return <Flame aria-hidden="true" />;
  if (type === "progression") return <Dumbbell aria-hidden="true" />;
  if (type === "review") return <Trophy aria-hidden="true" />;
  if (type === "change") return <RefreshCw aria-hidden="true" />;
  return <Sparkles aria-hidden="true" />;
}

function FeedCard({
  item,
  actorId,
  mutate,
}: {
  item: FeedItem;
  actorId: string;
  mutate: Mutate;
}) {
  const ownReaction = item.reactions.find((reaction) => reaction.athleteId === actorId)?.emoji;
  const counts = Object.fromEntries(
    reactions.map((emoji) => [emoji, item.reactions.filter((reaction) => reaction.emoji === emoji).length]),
  );
  return (
    <article className="feed-card">
      <div className="feed-avatar">{item.athleteName.slice(0, 1)}</div>
      <div className="feed-content">
        <div className="feed-meta">
          <span>{item.athleteName}</span>
          <small>{formatRelativeTime(item.createdAt)}</small>
        </div>
        <p>{item.message}</p>
        {Array.isArray(item.metadata.progressionMessages) && item.metadata.progressionMessages.length ? (
          <div className="feed-progress-note">
            <Dumbbell aria-hidden="true" />
            <span>{item.metadata.progressionMessages.join(" · ")}</span>
          </div>
        ) : null}
        <div className="reaction-row" aria-label="React to activity">
          {reactions.map((emoji) => (
            <button
              type="button"
              key={emoji}
              className={ownReaction === emoji ? "reaction-active" : ""}
              onClick={() => mutate({ action: "react", activityId: item.id, emoji })}
              aria-label={`React ${emoji}`}
            >
              <span>{emoji}</span>
              {counts[emoji] ? <small>{counts[emoji]}</small> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="feed-type-icon"><ActivityIcon type={item.activityType} /></div>
    </article>
  );
}

export function FeedView({ data, mutate, onRefresh }: { data: AppData; mutate: Mutate; onRefresh: () => Promise<unknown> }) {
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState("");
  const items = data.feed.filter((item) =>
    filter === "all" ? true : item.athleteId === filter,
  );
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshStatus("");
    try {
      await onRefresh();
      setRefreshStatus("✓ Feed updated");
      window.setTimeout(() => setRefreshStatus(""), 2400);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="view-stack">
      <section className="feed-hero">
        <div className="feed-hero-orbit"><Activity aria-hidden="true" /></div>
        <p className="eyebrow">Private team feed</p>
        <h1>Train apart. Stay connected.</h1>
        <p>Completions, plan changes and progressions for Thomas and KT only.</p>
      </section>
      <section>
        <SectionHeading eyebrow="Latest" title="Activity" />
        <div className="feed-refresh-row">
          <Button type="button" variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw aria-hidden="true" /> {refreshing ? "Refreshing…" : "Refresh"}</Button>
          {refreshStatus ? <span role="status">{refreshStatus}</span> : null}
        </div>
        <AthleteToggle athletes={data.athletes} value={filter} onChange={setFilter} includeAll />
        <div className="feed-list">
          {items.map((item) => <FeedCard item={item} actorId={data.actor.id} mutate={mutate} key={item.id} />)}
        </div>
      </section>
    </div>
  );
}
