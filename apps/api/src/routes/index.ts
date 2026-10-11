import { HealthSchema } from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { migrationVersion } from '../db/client.js';
import { exportRoutes } from './export.js';
import { garminRoutes } from './garmin.js';
import { logRoutes } from './log.js';
import { planRoutes } from './plan.js';
import { setupRoutes } from './setup.js';
import { strengthRoutes } from './strength.js';

export const routes: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/health', { schema: { tags: ['health'], response: { 200: HealthSchema } } }, () => {
    let dbOk = false;
    let migration: string | null = null;
    try {
      app.sqlite.prepare('select 1').get();
      migration = migrationVersion(app.sqlite);
      dbOk = true;
    } catch (err) {
      app.log.error(err, 'health: database check failed');
    }
    return {
      ok: dbOk,
      version: app.appVersion,
      uptime_s: Math.round(process.uptime()),
      db: { ok: dbOk, migration },
    };
  });

  app.get('/docs/json', { schema: { hide: true } }, () => app.swagger());

  await app.register(setupRoutes);
  await app.register(planRoutes);
  await app.register(strengthRoutes);
  await app.register(logRoutes);
  await app.register(garminRoutes);
  await app.register(exportRoutes);
};
