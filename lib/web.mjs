import { createHash, randomBytes } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { allowedRole, builtins, rolePanel } from './bot.mjs';

const api = 'https://discord.com/api/v10';
const guildID = /^\d{17,20}$/;
const commandName = /^[a-z0-9_-]{1,32}$/;
const reserved = new Set(builtins.map(command => command.name));
const assignable = new Set(['role', 'replaceRoles', 'welcomeRole', 'selfRoles']);
const idFields = new Set(['role', 'welcomeRole', 'welcomeChannel', 'roleChannel', 'logChannel']);
const roleFields = new Set(['role', 'welcomeRole']);
const listFields = { ignore: 100, ignoreRoles: 50, replaceRoles: 20, selfRoles: 25 };
const intFields = { textRate: [1, 100], voiceRate: [1, 100], cooldown: [5, 600], rewardLevel: [1, 1000], dailyXP: [1, 1000], floodCount: [0, 30], timeoutSeconds: [10, 3600] };
const textFields = { welcomeMessage: 400, roleMessage: 400, blockedTerms: 500 };
const boolFields = new Set(['text', 'voice', 'public', 'welcome', 'blockInvites', 'prefixEnabled']);
const prefixPattern = /^[^\s/@\\`]{1,5}$/;
const sidHash = sid => createHash('sha256').update(sid).digest('hex');
const token = () => randomBytes(32).toString('base64url');

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cookie(request, name) {
  const part = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(name + '='));
  return part?.slice(name.length + 1) || '';
}

async function discord(path, access) {
  const response = await fetch(api + path, { headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(8000) });
  if (response.status === 401) throw new RequestError(401, 'Discord 登录已过期，请重新登录。');
  if (!response.ok) throw new RequestError(502, 'Discord 暂时无法读取，请稍后重试。');
  return response.json();
}

function checkTarget(guild, actor, id, role, mustAssign) {
  if (!id) return;
  const item = (role ? guild.roles : guild.channels).cache.get(id);
  if (!item) throw new RequestError(400, '频道或身份组不存在，请重新选择。');
  if (mustAssign && (!allowedRole(item) || !actor.permissions.has(P.ManageRoles) || (actor.id !== guild.ownerId && actor.roles.highest.comparePositionTo(item) <= 0))) {
    throw new RequestError(403, '你或 Bot 无权管理所选身份组，或该身份组拥有管理权限。');
  }
}

function validateSettings(body, guild, actor) {
  const result = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, '设置格式无效。');
  for (const [key, value] of Object.entries(body)) {
    if (Object.hasOwn(intFields, key) && Number.isInteger(value) && value >= intFields[key][0] && value <= intFields[key][1]) {
      if (key === 'floodCount' && value === 1) throw new RequestError(400, '刷屏阈值必须为 0 或至少 2 条。');
      result[key] = value;
    } else if (boolFields.has(key) && typeof value === 'boolean') {
      result[key] = value;
    } else if (Object.hasOwn(textFields, key) && typeof value === 'string' && value.length <= textFields[key]) {
      result[key] = value.trim();
    } else if (idFields.has(key) && typeof value === 'string' && (!value || guildID.test(value))) {
      checkTarget(guild, actor, value, roleFields.has(key), assignable.has(key));
      if (value && !roleFields.has(key)) {
        const channel = guild.channels.cache.get(value);
        if (!channel.isSendable() || !channel.permissionsFor(actor)?.has([P.ViewChannel, P.SendMessages]) ||
          !channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) {
          throw new RequestError(403, '你和 Bot 都需要能在指定频道发言。');
        }
      }
      result[key] = value;
    } else if (Object.hasOwn(listFields, key) && Array.isArray(value) && value.length <= listFields[key] && value.every(id => typeof id === 'string' && guildID.test(id))) {
      for (const id of value) checkTarget(guild, actor, id, key !== 'ignore', assignable.has(key));
      result[key] = [...new Set(value)];
    } else if (key === 'roleStyle' && ['buttons', 'select'].includes(value)) {
      result[key] = value;
    } else if (key === 'prefix' && typeof value === 'string' && prefixPattern.test(value.trim())) {
      result[key] = value.trim();
    } else {
      throw new RequestError(400, '设置字段无效：' + key);
    }
  }
  return result;
}

function parseCommand(body, guild) {
  const { name, roles, slash, reply, trigger, embedTitle, embedDescription, embedColor } = body || {};
  const validText = (value, max) => typeof value === 'string' && value.length <= max;
  if (typeof name !== 'string' || !commandName.test(name) || reserved.has(name) ||
    !validText(reply, 1800) || !validText(trigger, 80) || !validText(embedTitle, 256) || !validText(embedDescription, 2000) ||
    typeof embedColor !== 'string' || !/^#[a-f\d]{6}$/i.test(embedColor) ||
    typeof slash !== 'boolean' || (!slash && !trigger.trim()) ||
    (!reply.trim() && !embedTitle.trim() && !embedDescription.trim()) ||
    !Array.isArray(roles) || roles.length > 25 || !roles.every(id => typeof id === 'string' && guild.roles.cache.has(id))) {
    throw new RequestError(400, '请检查指令名称、触发方式、回复内容和身份组。');
  }
  return { name, roles: [...new Set(roles)], slash, reply: reply.trim(), trigger: trigger.trim().toLowerCase(), embedTitle: embedTitle.trim(), embedDescription: embedDescription.trim(), embedColor };
}

export function installWeb(app, { store, bot, origin, clientId, clientSecret }) {
  const secure = origin.startsWith('https:');
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const callback = origin + '/auth/discord/callback';
  const operations = new Map();

  async function exclusive(guildID, work) {
    const prior = operations.get(guildID) || Promise.resolve();
    const next = prior.catch(() => {}).then(work);
    operations.set(guildID, next);
    try { return await next; }
    finally { if (operations.get(guildID) === next) operations.delete(guildID); }
  }

  async function session(request) {
    const sid = cookie(request, 'gb_session');
    const access = /^[\w-]{43}$/.test(sid) ? await store.session(sidHash(sid)) : undefined;
    if (!access) throw new RequestError(401, '请先使用 Discord 登录。');
    return access;
  }

  async function manager(request) {
    const access = await session(request);
    const user = await discord('/users/@me', access);
    const guild = bot.client.guilds.cache.get(request.params.guild);
    if (!guild?.available) throw new RequestError(404, '此服务器尚未连接 Bot。');
    const member = await guild.members.fetch({ user: user.id, force: true }).catch(error => {
      if (error.code === 10007) return null;
      throw error;
    });
    if (!member?.permissions.has(P.ManageGuild)) throw new RequestError(403, '你没有管理此服务器的权限。');
    return { guild, member, user };
  }

  app.use(['/api', '/auth'], (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'DELETE'].includes(request.method) && request.get('origin') !== origin) {
      return next(new RequestError(403, '请求来源与网站地址不一致。'));
    }
    next();
  });

  app.get('/auth/discord', (request, response) => {
    const state = token();
    response.cookie('gb_oauth', state, { ...cookieOptions, maxAge: 10 * 60000 });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: 'identify guilds', state });
    response.redirect(url.href);
  });

  app.get('/auth/discord/callback', async (request, response) => {
    const { code, state } = request.query;
    const expected = cookie(request, 'gb_oauth');
    response.clearCookie('gb_oauth', cookieOptions);
    if (!expected || state !== expected || typeof code !== 'string') throw new RequestError(400, '授权未完成或已过期，请重新登录。');
    const exchanged = await fetch(api + '/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: callback }),
      signal: AbortSignal.timeout(8000)
    });
    if (!exchanged.ok) throw new RequestError(400, 'Discord 授权失败，请检查 Redirect URL 后再试。');
    const credentials = await exchanged.json();
    const sid = token();
    const life = Math.min(credentials.expires_in, 86400);
    const previous = cookie(request, 'gb_session');
    if (previous) await store.endSession(sidHash(previous));
    await store.createSession(sidHash(sid), credentials.access_token, life);
    response.cookie('gb_session', sid, { ...cookieOptions, maxAge: life * 1000 });
    response.redirect('/#/live');
  });

  app.post('/api/logout', async (request, response) => {
    const sid = cookie(request, 'gb_session');
    if (sid) await store.endSession(sidHash(sid));
    response.clearCookie('gb_session', cookieOptions).sendStatus(204);
  });

  app.get('/api/guilds', async (request, response) => {
    const access = await session(request);
    const [profile, guilds] = await Promise.all([discord('/users/@me', access), discord('/users/@me/guilds?limit=200', access)]);
    const needed = P.ViewChannel | P.SendMessages | P.AttachFiles | P.EmbedLinks | P.ManageRoles | P.ManageMessages | P.ModerateMembers | P.ReadMessageHistory;
    response.json({
      profile: profile.global_name || profile.username,
      guilds: guilds.filter(item => item.owner || (BigInt(item.permissions) & (P.ManageGuild | P.Administrator)) !== 0n).map(item => {
        const invite = new URL('https://discord.com/oauth2/authorize');
        invite.search = new URLSearchParams({ client_id: clientId, scope: 'bot applications.commands', permissions: String(needed), guild_id: item.id, disable_guild_select: 'true', integration_type: '0' });
        return { id: item.id, name: item.name, installed: Boolean(bot.client.guilds.cache.get(item.id)?.available), invite: invite.href };
      })
    });
  });

  app.get('/api/guilds/:guild', async (request, response) => {
    const { guild } = await manager(request);
    const [config, commands, logs] = await Promise.all([store.settings(guild.id), store.commands(guild.id), store.logs(guild.id)]);
    response.json({
      name: guild.name, config, commands, logs,
      capabilities: bot.capabilities || {
        messageContentIntent: true,
        features: {
          prefixCommands: true, customTriggers: true, contentModeration: true,
          slashCommands: true, textXp: true, voiceXp: true, floodModeration: true
        }
      },
      channels: guild.channels.cache.filter(channel => channel.isTextBased() || channel.isVoiceBased()).map(channel => ({ id: channel.id, name: channel.name, sendable: channel.isSendable() })),
      roles: guild.roles.cache.filter(role => role.id !== guild.id).map(role => ({ id: role.id, name: role.name, assignable: Boolean(allowedRole(role)) }))
    });
  });

  app.patch('/api/guilds/:guild/settings', async (request, response) => {
    const { guild, member, user } = await manager(request);
    const patch = validateSettings(request.body, guild, member);
    await store.save(guild.id, patch);
    await store.log(guild.id, 'settings', user.username + ' 更新了服务器设置');
    response.sendStatus(204);
  });

  app.post('/api/guilds/:guild/panel', async (request, response) => {
    const { guild, member, user } = await manager(request);
    if (!member.permissions.has(P.ManageRoles)) throw new RequestError(403, '发布身份组面板需要管理身份组权限。');
    await exclusive(guild.id, async () => {
      const config = await store.settings(guild.id);
      for (const id of config.selfRoles) checkTarget(guild, member, id, true, true);
      const channel = guild.channels.cache.get(config.roleChannel);
      const message = rolePanel(guild, config);
      if (!channel?.isSendable() || !message || !channel.permissionsFor(member)?.has([P.ViewChannel, P.SendMessages])) {
        throw new RequestError(400, '请选择你可以发言的频道和至少一个可管理的身份组。');
      }
      const published = await channel.send(message);
      try { await store.save(guild.id, { panelId: published.id, panelChannel: channel.id }); }
      catch (error) {
        await published.delete().catch(() => {});
        throw error;
      }
      if (config.panelId && config.panelChannel) {
        const previous = guild.channels.cache.get(config.panelChannel);
        if (previous?.isTextBased()) await previous.messages.edit(config.panelId, { components: [] }).catch(() => {});
      }
      await store.log(guild.id, 'roles', user.username + ' 发布了自助身份组面板');
      response.json({ url: published.url });
    });
  });

  async function syncTriggers(guild) {
    const commands = await store.commands(guild);
    await store.save(guild, { triggers: Object.fromEntries(commands.filter(command => command.trigger).map(command => [command.trigger, command.name])) });
  }

  app.post('/api/guilds/:guild/commands', async (request, response) => {
    const { guild, user } = await manager(request);
    const command = parseCommand(request.body, guild);
    await exclusive(guild.id, async () => {
      const before = await store.command(guild.id, command.name);
      const all = await store.commands(guild.id);
      if (command.trigger && all.some(item => item.name !== command.name && item.trigger === command.trigger)) {
        throw new RequestError(409, '这个触发词已被另一条指令使用。');
      }
      if (!before && all.length >= 50) throw new RequestError(400, '每台服务器最多 50 条自定义指令。');
      if (command.slash) {
        const created = await guild.commands.create({ name: command.name, description: '执行 ' + command.name });
        command.discordId = created.id;
      } else if (before?.discordId) {
        await guild.commands.delete(before.discordId).catch(error => { if (error.code !== 10063) throw error; });
      }
      await store.saveCommand(guild.id, command.name, command);
      await syncTriggers(guild.id);
      await store.log(guild.id, 'commands', user.username + ' 保存了 /' + command.name);
    });
    response.sendStatus(204);
  });

  app.delete('/api/guilds/:guild/commands/:name', async (request, response) => {
    const { guild, user } = await manager(request);
    const { name } = request.params;
    await exclusive(guild.id, async () => {
      const command = await store.command(guild.id, name);
      if (command?.discordId) await guild.commands.delete(command.discordId).catch(error => { if (error.code !== 10063) throw error; });
      await store.removeCommand(guild.id, name);
      await syncTriggers(guild.id);
      await store.log(guild.id, 'commands', user.username + ' 删除了 /' + name);
    });
    response.sendStatus(204);
  });

  app.get('/api/leaderboard/:guild', async (request, response) => {
    const guild = bot.client.guilds.cache.get(request.params.guild);
    if (!guild?.available || !(await store.settings(guild.id)).public) throw new RequestError(404, '排行榜未公开或服务器不存在。');
    const period = Number(request.query.days);
    const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 80) : '';
    response.json({ name: guild.name, rows: await store.ranking(guild.id, [7, 30].includes(period) ? period : 0, search) });
  });

  app.use('/api', (request, response) => response.status(404).json({ error: '接口不存在。' }));
}

export function webError(error, request, response, next) {
  if (response.headersSent) return next(error);
  if (!error.status || error.status >= 500) console.error('HTTP request failed:', error.code || error.name);
  response.status(error.status || 500).json({ error: error.status ? error.message : '操作未完成，请稍后重试。' });
}
