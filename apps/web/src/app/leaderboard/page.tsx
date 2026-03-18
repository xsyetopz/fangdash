"use client";

import type { DifficultyName } from "@fangdash/shared";
import {
  areModsCompatible,
  decodeMods,
  DIFFICULTY_LEVELS,
  MOD_DEFINITIONS,
} from "@fangdash/shared";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client.ts";
import { useTRPC } from "@/lib/trpc.ts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "daily" | "weekly" | "all-time";

const TABS: { id: Tab; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all-time", label: "All Time" },
];

function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="text-2xl font-black tabular-nums text-amber-400 drop-shadow-sm min-w-[2.5rem] text-center">
        #1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="text-2xl font-black tabular-nums text-zinc-300 min-w-[2.5rem] text-center">
        #2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="text-2xl font-black tabular-nums text-orange-400 min-w-[2.5rem] text-center">
        #3
      </span>
    );
  }
  return (
    <span className="text-lg font-bold tabular-nums text-muted-foreground min-w-[2.5rem] text-center">
      #{rank}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const level = DIFFICULTY_LEVELS.find((l) => l.name === difficulty);
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: level.color }}
      />
      {level.label}
    </span>
  );
}

function ModIcons({ mods }: { mods: number }) {
  if (!mods) return null;
  const activeMods = decodeMods(mods);
  return (
    <span className="inline-flex items-center gap-0.5">
      {activeMods.map(({ id, name, icon }) => (
        <span key={id} className="text-sm" title={name}>
          {icon}
        </span>
      ))}
    </span>
  );
}

function SkeletonCards() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-10 rounded" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-20 rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildModsMask(selectedFlags: Set<number>): number {
  let mask = 0;
  for (const flag of selectedFlags) {
    mask |= flag;
  }
  return mask;
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all-time");
  const [activeDifficulty, setActiveDifficulty] = useState<
    DifficultyName | "all"
  >("all");
  const [selectedModFlags, setSelectedModFlags] = useState<Set<number>>(
    new Set(),
  );
  const [modsMode, setModsMode] = useState<"all" | "none" | "selected">("all");

  const trpc = useTRPC();
  const { data: session } = useSession();

  const period = activeTab === "all-time" ? ("all" as const) : activeTab;

  const activeMods: number | undefined = modsMode === "all"
    ? undefined
    : modsMode === "none"
    ? 0
    : buildModsMask(selectedModFlags);

  const leaderboardQuery = useQuery(
    trpc.score.leaderboard.queryOptions({
      limit: 50,
      period,
      difficulty: activeDifficulty === "all" ? undefined : activeDifficulty,
      mods: activeMods,
    }),
  );

  const entries = leaderboardQuery.data ?? [];
  const currentUsername = session?.user?.name;

  useEffect(() => {
    if (leaderboardQuery.isError) {
      toast.error("Failed to load leaderboard.");
    }
  }, [leaderboardQuery.isError]);

  function toggleModFlag(flag: number) {
    const next = new Set(selectedModFlags);
    if (next.has(flag)) {
      next.delete(flag);
    } else {
      // Check compatibility before adding
      const combined = buildModsMask(next) | flag;
      if (!areModsCompatible(combined)) return;
      next.add(flag);
    }
    if (next.size === 0) {
      setModsMode("all");
    } else {
      setModsMode("selected");
    }
    setSelectedModFlags(next);
  }

  const readyMods = MOD_DEFINITIONS.filter((m) => m.ready);

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
          Leaderboard
        </h1>
        <p className="mt-2 text-muted-foreground">Top runners in FangDash</p>

        {/* Period Tabs */}
        <div className="mt-6 flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
                activeTab === id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Difficulty Filter */}
        <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveDifficulty("all")}
            aria-pressed={activeDifficulty === "all"}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              activeDifficulty === "all"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
            )}
          >
            All
          </button>
          {DIFFICULTY_LEVELS.map(({ name, label: lvl, color }) => (
            <button
              type="button"
              key={name}
              onClick={() => setActiveDifficulty(name)}
              aria-pressed={activeDifficulty === name}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                activeDifficulty === name
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="hidden sm:inline">{lvl}</span>
            </button>
          ))}
        </div>

        {/* Mods Filter — multi-toggle */}
        <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setModsMode("all");
              setSelectedModFlags(new Set());
            }}
            aria-pressed={modsMode === "all"}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              modsMode === "all"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setModsMode("none");
              setSelectedModFlags(new Set());
            }}
            aria-pressed={modsMode === "none"}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              modsMode === "none"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
            )}
          >
            No Mods
          </button>
          {readyMods.map(({ id, flag, icon, name: modName }) => {
            const isActive = modsMode === "selected" &&
              selectedModFlags.has(flag);
            // Disable if adding this mod would be incompatible with current selection
            const combinedIfAdded = buildModsMask(selectedModFlags) | flag;
            const isDisabled = !isActive && modsMode === "selected" &&
              !areModsCompatible(combinedIfAdded);
            return (
              <button
                type="button"
                key={id}
                disabled={isDisabled}
                onClick={() => {
                  setModsMode("selected");
                  toggleModFlag(flag);
                }}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                  isDisabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span>{icon}</span>
                <span className="hidden sm:inline">{modName}</span>
              </button>
            );
          })}
        </div>

        {/* Leaderboard Cards */}
        <div className="mt-6 flex flex-col gap-2">
          {leaderboardQuery.isLoading && <SkeletonCards />}

          {!leaderboardQuery.isLoading && entries.length === 0 && (
            <Card>
              <CardContent className="px-4 py-12 text-center text-muted-foreground">
                No scores yet. Be the first to play!
              </CardContent>
            </Card>
          )}

          {entries.map((entry) => {
            const sid = entry.scoreId;
            const isCurrentUser = currentUsername != null &&
              entry.username === currentUsername;
            const isTop3 = entry.rank <= 3;

            return (
              <Card
                key={sid}
                className={cn(
                  "transition-all",
                  isCurrentUser && "ring-1 ring-primary/40 bg-primary/5",
                  entry.rank === 1 &&
                    "ring-1 ring-amber-400/40 bg-amber-400/5",
                  entry.rank === 2 && "ring-1 ring-zinc-400/30 bg-zinc-400/5",
                  entry.rank === 3 &&
                    "ring-1 ring-orange-400/30 bg-orange-400/5",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className="flex-none">
                      <RankDisplay rank={entry.rank} />
                    </div>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {"userImage" in entry && entry.userImage
                        ? (
                          <Image
                            src={entry.userImage as string}
                            alt={entry.username ?? ""}
                            width={36}
                            height={36}
                            className={cn(
                              "size-9 rounded-full object-cover ring-2 ring-border flex-none",
                              isTop3 && entry.rank === 1 && "ring-amber-400/60",
                              isTop3 && entry.rank === 2 && "ring-zinc-400/60",
                              isTop3 && entry.rank === 3 &&
                                "ring-orange-400/60",
                            )}
                          />
                        )
                        : (
                          <div className="size-9 rounded-full bg-muted flex items-center justify-center flex-none ring-2 ring-border text-sm font-bold text-muted-foreground">
                            {(entry.username ?? "?")[0]?.toUpperCase()}
                          </div>
                        )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {"profilePublic" in entry &&
                              entry.profilePublic === 1 &&
                              "userId" in entry
                            ? (
                              <Link
                                href={`/profile/${entry.userId}`}
                                className="font-semibold text-foreground hover:text-primary transition-colors hover:underline truncate"
                              >
                                {entry.username}
                              </Link>
                            )
                            : (
                              <span className="font-semibold text-foreground truncate">
                                {entry.username}
                              </span>
                            )}
                          {"level" in entry && (
                            <Badge variant="level">Lv.{entry.level}</Badge>
                          )}
                          {isCurrentUser && (
                            <span className="text-xs text-primary font-medium">
                              (you)
                            </span>
                          )}
                        </div>
                        {/* Secondary info row */}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {activeDifficulty === "all" && (
                            <DifficultyBadge difficulty={entry.difficulty} />
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatNumber(Math.round(entry.distance))}m
                          </span>
                          {"mods" in entry &&
                            typeof entry.mods === "number" &&
                            entry.mods > 0 && <ModIcons mods={entry.mods} />}
                          <span className="text-xs text-muted-foreground/60">
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex-none text-right">
                      <span
                        className={cn(
                          "text-xl font-black tabular-nums",
                          entry.rank === 1 && "text-amber-400",
                          entry.rank === 2 && "text-zinc-300",
                          entry.rank === 3 && "text-orange-400",
                          entry.rank > 3 && "text-foreground",
                        )}
                      >
                        {formatNumber(entry.score)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
