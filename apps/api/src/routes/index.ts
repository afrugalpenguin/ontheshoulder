import { HealthSchema } from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { eq } from 'drizzle-orm';
import { migrationVersion } from '../db/client.js';
import { app_state } from '../db/schema.js';
import { backupStatus } from '../ops/backup.js';
import { adminRoutes } from './admin.js';
import { exportRoutes } from './export.js';
import { garminRoutes } from './garmin.js';
import { logRoutes } from './log.js';
import { planRoutes } from './plan.js';
import { setupRoutes } from './setup.js';
import { strengthRoutes } from './strength.js';
import { trendRoutes } from './trends.js';

export const routes: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/health', { schema: { tags: ['health'], response: { 200: HealthSchema } } }, () => {
    let dbOk = false;
    let migration: string | null = null;
    let lastSync: string | null = null;
    try {
      app.sqlite.prepare('select 1').get();
      migration = migrationVersion(app.sqlite);
      const garmin = app.db
        .select()
        .from(app_state)
        .where(eq(app_state.key, 'garmin_status'))
        .get();
      lastSync = (garmin?.value as { at?: string } | undefined)?.at ?? null;
      dbOk = true;
    } catch (err) {
      app.log.error(err, 'health: database check failed');
    }
    const backup = backupStatus(app.dataDir);
    return {
      ok: dbOk,
      version: app.appVersion,
      uptime_s: Math.round(process.uptime()),
      db: { ok: dbOk, migration },
      backup: { last: backup.last, count: backup.count },
      garmin: { last_sync: lastSync },
    };
  });

  app.get('/docs/json', { schema: { hide: true } }, () => app.swagger());

  await app.register(setupRoutes);
  await app.register(planRoutes);
  await app.register(strengthRoutes);
  await app.register(logRoutes);
  await app.register(garminRoutes);
  await app.register(exportRoutes);
  await app.register(trendRoutes);
  await app.register(adminRoutes);
};
