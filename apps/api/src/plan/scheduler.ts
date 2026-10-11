import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import { app_state, athlete } from '../db/schema.js';
import { dueWeek } from '../engine/schedule.js';
import { HttpError } from '../errors.js';
import { generateWeekPlan } from './generate.js';

const MARKER_KEY = 'plan_scheduler_last_week';
const CHECK_EVERY_MS = 60_000;

function readMarker(db: Db): string | null {
  const row = db.select().from(app_state).where(eq(app_state.key, MARKER_KEY)).get();
  return typeof row?.value === 'string' ? row.value : null;
}

function writeMarker(db: Db, isoWeek: string): void {
  db.insert(app_state)
    .values({ key: MARKER_KEY, value: isoWeek })
    .onConflictDoUpdate({ target: app_state.key, set: { value: isoWeek } })
    .run();
}

/**
 * Generates next week's plan if the athlete's scheduled time has passed and it
 * has not been handled yet. Safe to call as often as you like and across
 * restarts: the handled week is persisted. Returns the week it acted on.
 */
export function runScheduledGeneration(
  db: Db,
  log: FastifyBaseLogger,
  now = new Date(),
): string | null {
  const who = db.select().from(athlete).get();
  if (!who) return null; // Setup has not been done; there is nothing to plan for.
  const target = dueWeek(now, { weekday: who.plan_weekday, time: who.plan_time }, readMarker(db));
  if (target === null) return null;

  try {
    const { changes } = generateWeekPlan(db, target);
    log.info({ week: target, ...changes }, 'scheduled generation: week planned');
  } catch (err) {
    if (!(err instanceof HttpError) || err.statusCode !== 409) throw err;
    // The week already has logged or skipped sessions. Leave it to the user.
    log.info({ week: target }, 'scheduled generation: week already in use, left alone');
  }
  writeMarker(db, target);
  return target;
}

/** Checks once now and then every minute. Returns a function that stops it. */
export function startScheduler(db: Db, log: FastifyBaseLogger): () => void {
  const tick = () => {
    try {
      runScheduledGeneration(db, log);
    } catch (err) {
      log.error(err, 'scheduled generation failed');
    }
  };
  tick();
  const timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref();
  log.info('plan scheduler started');
  return () => clearInterval(timer);
}
