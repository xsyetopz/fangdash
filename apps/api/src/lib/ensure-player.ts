import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { player } from "../db/schema.ts";

/**
 * Gets or creates a player record for the given user.
 * Uses an atomic upsert to avoid TOCTOU race conditions.
 */
export async function ensurePlayer(db: DrizzleD1Database<typeof schema>, userId: string) {
	const now = new Date();

	const [upserted] = await db
		.insert(player)
		.values({
			id: crypto.randomUUID(),
			userId,
			equippedSkinId: "gray-wolf",
			totalScore: 0,
			totalDistance: 0,
			totalObstaclesCleared: 0,
			gamesPlayed: 0,
			racesPlayed: 0,
			racesWon: 0,
			totalXp: 0,
			level: 1,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: player.userId })
		.returning();

	if (upserted) return upserted;

	// Conflict occurred — row already exists, fetch it
	return db.select().from(player).where(eq(player.userId, userId)).get();
}
