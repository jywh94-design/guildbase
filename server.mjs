import express from 'express';
import { fileURLToPath } from 'node:url';

const app = express();
const names = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'APP_URL'];
const production = names.some(name => process.env[name]);
const dist = fileURLToPath(new URL('./dist', import.meta.url));
app.disable('x-powered-by');
app.use((request, response, next) => {
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY'
  });
  next();
});
app.use(express.json({ limit: '25kb' }));

let store;
let bot;
if (production) {
  const missing = names.filter(name => !process.env[name]);
  if (missing.length) throw new Error('Missing environment variables: ' + missing.join(', '));
  const origin = new URL(process.env.APP_URL).origin;
  if (!origin.startsWith('https:') && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
    throw new Error('APP_URL must use HTTPS outside localhost');
  }
  const devGuildId = process.env.DISCORD_DEV_GUILD_ID?.trim() || '';
  if (devGuildId && !/^\d{17,20}$/.test(devGuildId)) throw new Error('DISCORD_DEV_GUILD_ID must be a valid Discord guild ID');
  const messageContentIntent = !['false', '0', 'no'].includes((process.env.DISCORD_MESSAGE_CONTENT_INTENT || 'true').trim().toLowerCase());
  const [{ openStore }, { createBot }, { installWeb }] = await Promise.all([
    import('./lib/store.mjs'), import('./lib/bot.mjs'), import('./lib/web.mjs')
  ]);
  store = await openStore({ databaseURL: process.env.DATABASE_URL, redisURL: process.env.REDIS_URL });
  bot = createBot(store, process.env.DISCORD_BOT_TOKEN, { origin, devGuildId, messageContentIntent });
  await bot.start();
  if (bot.client.user?.id !== process.env.DISCORD_CLIENT_ID) throw new Error('Discord application and bot IDs must match');
  installWeb(app, { store, bot, origin, clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET });
}
app.get('/runtime.json', (request, response) => response.set('Cache-Control', 'no-store').json({ live: production }));
app.get('/healthz', async (request, response) => {
  if (production && (!bot.client.isReady() || !store.redis.isReady)) return response.sendStatus(503);
  if (production) await store.db.query('SELECT 1');
  response.sendStatus(200);
});
app.use(express.static(dist));
const { webError } = await import('./lib/web.mjs');
app.use(webError);
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    bot?.stop();
    server.close(async () => {
      await store?.redis.close().catch(() => {});
      await store?.db.end();
    });
  });
}
