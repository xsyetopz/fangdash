import { TRPCError } from "@trpc/server";
import { getLevelFromXp } from "@fangdash/shared";
import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { player, raceHistory } from "../../db/schema.ts";
import { checkAchievements } from "../../lib/achievement-checker.ts";
import { ensurePlayer } from "../../lib/ensure-player.ts";
import { checkSkinUnlocks } from "../../lib/skin-unlocker.ts";
import { protectedProcedure, router } from "../trpc.ts";

export const raceRouter = router({
	submitResult: protectedProcedure
		.input(
			z.object({
				raceId: z.string().min(1),
				score: z.number().int().min(0),
				distance: z.number().min(0),
				seed: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const playerRecord = await ensurePlayer(ctx.db, ctx.user.id);
			if (!playerRecord) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create player" });
			}

			const now = new Date();
			const raceHistoryId = crypto.randomUUID();

			// Insert with provisional placement
			const countRows = await ctx.db
				.select({ total: count() })
				.from(raceHistory)
				.where(eq(raceHistory.raceId, input.raceId));
			const provisionalPlacement = (countRows[0]?.total ?? 0) + 1;

			await ctx.db.insert(raceHistory).values({
				id: raceHistoryId,
				raceId: input.raceId,
				playerId: playerRecord.id,
				placement: provisionalPlacement,
				score: input.score,
				distance: input.distance,
				seed: input.seed,
				createdAt: now,
			});

			// Determine authoritative placement by score ranking
			const allResults = await ctx.db
				.select({ id: raceHistory.id })
				.from(raceHistory)
				.where(eq(raceHistory.raceId, input.raceId))
				.orderBy(desc(raceHistory.score));

			const placement =
				allResults.findIndex((r) => r.id === raceHistoryId) + 1 || provisionalPlacement;

			// Correct stored placement if it differs
			if (placement !== provisionalPlacement) {
				await ctx.db
					.update(raceHistory)
					.set({ placement })
					.where(eq(raceHistory.id, raceHistoryId));
			}

			// Award XP: score + placement bonus
			const placementBonus =
				placement === 1 ? 500 : placement === 2 ? 250 : placement === 3 ? 100 : 0;
			const xpGained = input.score + placementBonus;
			const newTotalXp = playerRecord.totalXp + xpGained;
			const levelInfo = getLevelFromXp(newTotalXp);
			const previousLevel = playerRecord.level;

			// Atomic update: race stats + XP/level
			const updateSet: Record<string, unknown> = {
				racesPlayed: sql`${player.racesPlayed} + 1`,
				totalXp: sql`${player.totalXp} + ${xpGained}`,
				level: levelInfo.level,
				updatedAt: now,
			};

			if (placement === 1) {
				updateSet["racesWon"] = sql`${player.racesWon} + 1`;
			}

			await ctx.db.update(player).set(updateSet).where(eq(player.id, playerRecord.id));

			let newAchievements: string[] = [];
			let newSkins: string[] = [];
			let achievementError = false;

			try {
				const achievementResult = await checkAchievements(ctx.db, playerRecord.id);
				const newSkinUnlocks = await checkSkinUnlocks(
					ctx.db,
					playerRecord.id,
					achievementResult.stats,
				);
				newAchievements = achievementResult.newAchievements;
				newSkins = [...achievementResult.newSkins, ...newSkinUnlocks];
			} catch (err) {
				console.error("[race.submitResult] Achievement/skin check failed", {
					playerId: playerRecord.id,
					raceHistoryId,
					error: err,
				});
				achievementError = true;
			}

			return {
				raceHistoryId,
				placement,
				newAchievements,
				newSkins,
				achievementError,
				xpGained,
				levelUp: levelInfo.level > previousLevel,
				newLevel: levelInfo.level,
			};
		}),

	getHistory: protectedProcedure.query(async ({ ctx }) => {
		const playerRecord = await ensurePlayer(ctx.db, ctx.user.id);
		if (!playerRecord) {
			return [];
		}

		return ctx.db
			.select({
				raceId: raceHistory.raceId,
				placement: raceHistory.placement,
				score: raceHistory.score,
				distance: raceHistory.distance,
				seed: raceHistory.seed,
				createdAt: raceHistory.createdAt,
			})
			.from(raceHistory)
			.where(eq(raceHistory.playerId, playerRecord.id))
			.orderBy(desc(raceHistory.createdAt))
			.limit(20);
	}),

	getStats: protectedProcedure.query(async ({ ctx }) => {
		const playerRecord = await ensurePlayer(ctx.db, ctx.user.id);
		if (!playerRecord) {
			return { racesPlayed: 0, racesWon: 0 };
		}

		return {
			racesPlayed: playerRecord.racesPlayed,
			racesWon: playerRecord.racesWon,
		};
	}),
});
