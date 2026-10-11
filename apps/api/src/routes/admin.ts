import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { backupDir, backupStatus, runBackup } from '../ops/backup.js';
import { notFound } from '../errors.js';

const BackupResult = Type.Object({
  file: Type.String(),
  count: Type.Integer(),
  at: Type.String(),
});

export const adminRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const tags = ['admin'];

  app.post('/admin/backup', { schema: { tags, response: { 200: BackupResult } } }, async (req) => {
    const { file, count } = await runBackup(app.openDb, req.log);
    return { file, count, at: new Date().toISOString() };
  });

  // Streams the newest backup so it can be saved off the PC.
  app.get('/admin/backup/latest', { schema: { tags } }, (_req, reply) => {
    const { latest } = backupStatus(app.dataDir);
    if (!latest) throw notFound('backup');
    void reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${latest}"`);
    return reply.send(createReadStream(join(backupDir(app.dataDir), latest)));
  });
};
