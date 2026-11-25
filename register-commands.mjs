import { Client, Events, GatewayIntentBits } from 'discord.js';
import { once } from 'node:events';
import { builtins, registerBuiltinCommands } from './lib/bot.mjs';

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

const guildFlagIndex = process.argv.indexOf('--guild');
const devGuildId = (guildFlagIndex >= 0 ? process.argv[guildFlagIndex + 1] : process.env.DISCORD_DEV_GUILD_ID || '').trim();
if (devGuildId && !/^\d{17,20}$/.test(devGuildId)) {
  console.error('Invalid guild ID: ' + devGuildId);
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const abort = new AbortController();
const ready = once(client, Events.ClientReady, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]) });

try {
  await Promise.all([client.login(token), ready]);
  const result = await registerBuiltinCommands(client, { devGuildId, commands: builtins });
  console.log('Registered ' + result.count + ' built-in commands (' + result.scope + (result.guildId ? ': ' + result.guildId : '') + ').');
} finally {
  abort.abort();
  client.destroy();
}
