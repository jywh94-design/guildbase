import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, Events,
  GatewayIntentBits as Intent, MessageFlags, Partials, PermissionFlagsBits as Permission,
  StringSelectMenuBuilder
} from 'discord.js';
import { once } from 'node:events';
import { createCanvas } from '@napi-rs/canvas';
import { level } from './store.mjs';

export const version = '2.0.0';
export const builtins = [
  { name: 'ping', description: '检查 Bot 延迟与运行状态' },
  { name: 'help', description: '查看可用指令与功能说明' },
  { name: 'about', description: '查看 Bot 版本与项目信息' },
  { name: 'setup', description: '获取当前服务器的控制台配置链接' },
  { name: 'rank', description: '显示你的等级卡' },
  { name: 'leaderboard', description: '查看服务器 XP 排行榜' },
  { name: 'daily', description: '领取每日签到 XP' }
];
const builtinNames = new Set(builtins.map(command => command.name));

export function botCapabilities(messageContentIntent = true) {
  const hasContent = Boolean(messageContentIntent);
  return {
    messageContentIntent: hasContent,
    features: {
      prefixCommands: hasContent,
      customTriggers: hasContent,
      contentModeration: hasContent,
      slashCommands: true,
      textXp: true,
      voiceXp: true,
      floodModeration: true
    }
  };
}

export function parsePrefixCommand(content, prefix = '!') {
  if (!prefix || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith(prefix)) return null;
  const rest = trimmed.slice(prefix.length).trimStart();
  if (!rest) return null;
  const [rawName, ...args] = rest.split(/\s+/);
  return { name: rawName.toLowerCase(), args };
}

export async function registerBuiltinCommands(client, { devGuildId = '', commands = builtins } = {}) {
  if (devGuildId) {
    const guild = client.guilds.cache.get(devGuildId) || await client.guilds.fetch(devGuildId);
    for (const command of commands) await guild.commands.create(command);
    return { scope: 'guild', guildId: guild.id, count: commands.length };
  }
  for (const command of commands) await client.application.commands.create(command);
  return { scope: 'global', count: commands.length };
}
const blockedRolePermissions = Object.entries(Permission)
  .filter(([key]) => /^(Manage|Kick|Ban|Moderate|Administrator|ViewAuditLog|MentionEveryone|MoveMembers|DeafenMembers|MuteMembers)/.test(key))
  .map(([, bit]) => bit);

export function allowedRole(role) {
  return role?.editable && role.id !== role.guild.id && !role.permissions.any(blockedRolePermissions, false);
}

export function card(heading, name, detail, progress) {
  const canvas = createCanvas(800, 265);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17192e';
  ctx.fillRect(0, 0, 800, 265);
  ctx.fillStyle = '#bcb2ff';
  ctx.fillRect(0, 0, 9, 265);
  ctx.font = 'bold 23px sans-serif';
  ctx.fillText(heading, 40, 54, 715);
  ctx.fillStyle = '#f5f4ff';
  ctx.font = 'bold 43px sans-serif';
  ctx.fillText(name, 40, 116, 715);
  ctx.font = '25px sans-serif';
  ctx.fillText(detail, 40, 167, 715);
  if (progress !== undefined) {
    ctx.fillStyle = '#393958';
    ctx.fillRect(40, 199, 720, 10);
    ctx.fillStyle = '#88e9c6';
    ctx.fillRect(40, 199, 720 * progress, 10);
  }
  return canvas.toBuffer('image/png');
}

export function payload({ reply = '', embedTitle = '', embedDescription = '', embedColor = '#b9b1ff' }) {
  const result = { content: reply || undefined, allowedMentions: { parse: [] } };
  if (embedTitle || embedDescription) {
    result.embeds = [{
      title: embedTitle || undefined, description: embedDescription || undefined,
      color: Number.parseInt(embedColor.slice(1), 16)
    }];
  }
  return result;
}

export function rolePanel(guild, config) {
  const roles = config.selfRoles.map(id => guild.roles.cache.get(id)).filter(allowedRole);
  if (!roles.length) return null;
  const components = [];
  if (config.roleStyle === 'select') {
    const select = new StringSelectMenuBuilder().setCustomId('guildbase:role:select').setPlaceholder('选择一个身份组领取或取消')
      .addOptions(roles.map(role => ({ label: role.name.slice(0, 80), value: role.id })));
    components.push(new ActionRowBuilder().addComponents(select));
  } else {
    for (let offset = 0; offset < roles.length; offset += 5) {
      components.push(new ActionRowBuilder().addComponents(roles.slice(offset, offset + 5).map(role =>
        new ButtonBuilder().setCustomId('guildbase:role:' + role.id).setLabel(role.name.slice(0, 80)).setStyle(ButtonStyle.Secondary))));
    }
  }
  return { content: config.roleMessage || '选择你想领取或取消的身份组。', components, allowedMentions: { parse: [] } };
}

export function moderatorRule(content, config) {
  const text = content.toLowerCase();
  const terms = config.blockedTerms.toLowerCase().split(/[,，\n]/).map(term => term.trim()).filter(Boolean);
  if (terms.some(term => text.includes(term))) return '屏蔽词';
  if (config.blockInvites && /\b(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)\S+/i.test(text)) return 'Discord 邀请链接';
  return '';
}

function eligibleVoice(voice, config) {
  return voice?.channel && voice.member && !voice.member.user.bot && !voice.selfDeaf && !voice.serverDeaf &&
    voice.channelId !== voice.guild.afkChannelId && !config.ignore.includes(voice.channelId) &&
    !config.ignoreRoles.some(role => voice.member.roles.cache.has(role)) &&
    voice.channel.members.some(member => !member.user.bot && !member.voice.selfMute && !member.voice.serverMute);
}

export function createBot(store, token, options = {}) {
  const { origin = '', devGuildId = '', messageContentIntent = true, replyCooldownSeconds = 3 } = options;
  const capabilities = botCapabilities(messageContentIntent);
  const intents = [Intent.Guilds, Intent.GuildMembers, Intent.GuildMessages, Intent.GuildVoiceStates];
  if (capabilities.messageContentIntent) intents.push(Intent.MessageContent);
  const client = new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
  });
  const voices = new Map();
  const voiceQueue = new Map();
  const replyLimiter = new Map();
  let ticker;

  async function allowReply(guildId, userId) {
    if (replyCooldownSeconds <= 0) return true;
    const redisAllowed = await store.replyCooldown?.(guildId, userId, replyCooldownSeconds).catch(() => null);
    if (typeof redisAllowed === 'boolean') return redisAllowed;
    const now = Date.now();
    const key = guildId + ':' + userId;
    const expiresAt = replyLimiter.get(key) || 0;
    if (expiresAt > now) return false;
    replyLimiter.set(key, now + replyCooldownSeconds * 1000);
    if (replyLimiter.size > 1000) {
      for (const [k, exp] of replyLimiter) {
        if (exp <= now) replyLimiter.delete(k);
      }
    }
    return true;
  }

  function safeOrigin(value) {
    if (!value) return '';
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(parsed.origin)) {
        return parsed.origin;
      }
    } catch {}
    return '';
  }

  async function runBuiltin(name, { guild, member, createdTimestamp }) {
    switch (name) {
      case 'ping': {
        const wsPing = Number.isFinite(client.ws?.ping) && client.ws.ping >= 0 ? Math.round(client.ws.ping) + 'ms' : '测量中';
        const elapsed = Math.max(0, Date.now() - (createdTimestamp || Date.now()));
        return { content: 'Pong! WebSocket 延迟: ' + wsPing + ' · 处理耗时: ' + elapsed + 'ms', allowedMentions: { parse: [] } };
      }
      case 'about': {
        const degraded = !capabilities.messageContentIntent
          ? '\n\n⚠️ 当前未启用 Message Content Intent（仅支持斜杠指令），前缀指令、自定义文本触发词、屏蔽词与邀请链接检测已停用。'
          : '';
        return {
          embeds: [{
            title: 'GuildBase / Kibbo · v' + version,
            description: '多服务器 Discord 社区管理 Bot，支持等级与签到、排行榜、欢迎卡、自助身份组、自动管理与自定义指令。' + degraded,
            color: 0xb9b1ff
          }],
          allowedMentions: { parse: [] }
        };
      }
      case 'help': {
        const [config, customs] = await Promise.all([store.settings(guild.id, true), store.commands(guild.id)]);
        const lines = builtins.map(cmd => '• `/' + cmd.name + '` — ' + cmd.description);
        let prefixNote;
        if (!capabilities.messageContentIntent) {
          prefixNote = '⚠️ 当前未启用 Message Content Intent，仅支持斜杠指令（前缀指令、自定义文本触发词、屏蔽词与邀请链接自动管理不可用）。';
        } else if (!config.prefixEnabled) {
          prefixNote = '当前服务器已关闭前缀指令（仅支持斜杠指令），可在控制台开启。';
        } else {
          prefixNote = '当前服务器前缀：` ' + config.prefix + ' `（例如 `' + config.prefix + 'ping`、`' + config.prefix + 'rank`）。';
        }
        const permittedCustoms = customs.filter(cmd => permitted(member, cmd));
        const customLines = permittedCustoms.length
          ? '\n\n**自定义指令**\n' + permittedCustoms.map(cmd => {
            const parts = [];
            if (cmd.slash) parts.push('`/' + cmd.name + '`');
            if (capabilities.messageContentIntent && cmd.trigger) parts.push('触发词 `' + cmd.trigger + '`');
            return '• ' + (parts.join(' / ') || '`' + cmd.name + '`');
          }).join('\n')
          : '';
        return {
          embeds: [{
            title: 'GuildBase 指令帮助',
            description: lines.join('\n') + '\n\n' + prefixNote + customLines,
            color: 0xb9b1ff
          }],
          allowedMentions: { parse: [] }
        };
      }
      case 'setup': {
        if (!member.permissions.has(Permission.ManageGuild)) {
          return { content: '需要「管理服务器」权限才能查看服务器配置链接。', allowedMentions: { parse: [] } };
        }
        const trustedOrigin = safeOrigin(origin);
        if (!trustedOrigin) {
          return { content: '未配置可信后台地址（APP_URL），请联系管理员配置后再试。', allowedMentions: { parse: [] } };
        }
        const config = await store.settings(guild.id, true);
        const prefixStatus = !capabilities.messageContentIntent
          ? '不可用（未启用 Message Content Intent，仅支持斜杠指令）'
          : (config.prefixEnabled ? '已开启（前缀：`' + config.prefix + '`）' : '已关闭（仅支持斜杠指令）');
        return {
          embeds: [{
            title: '服务器控制台配置',
            description: '控制台链接：' + trustedOrigin + '/#/live\n前缀指令状态：' + prefixStatus,
            color: 0x88e9c6
          }],
          allowedMentions: { parse: [] }
        };
      }
      case 'rank': {
        const xp = await store.rank(guild.id, member.id);
        const current = level(xp);
        const start = current ** 2 * 100;
        const next = (current + 1) ** 2 * 100;
        const image = card('GUILDBASE  /  MEMBER RANK', member.displayName, 'LEVEL ' + current + '   •   ' + xp + ' / ' + next + ' XP', (xp - start) / (next - start));
        return { files: [new AttachmentBuilder(image, { name: 'rank.png' })] };
      }
      case 'daily': {
        const config = await store.settings(guild.id);
        const result = await store.daily(guild.id, member.id, member.displayName, config.dailyXP);
        if (!result) return { content: '今天已经签到。', allowedMentions: { parse: [] } };
        const amount = config.dailyXP * Math.min(result.streak, 7);
        await awardRole(member, Number(result.xp), config);
        return { content: '签到成功。连续 ' + result.streak + ' 天，获得 ' + amount + ' XP。', allowedMentions: { parse: [] } };
      }
      case 'leaderboard': {
        const rows = await store.ranking(guild.id, 0, '', 10);
        const lines = rows.map(row => row.pos + '. ' + row.name + ' · ' + row.score + ' XP');
        return { content: lines.join('\n') || '暂时还没有 XP 记录。', allowedMentions: { parse: [] } };
      }
      default:
        return null;
    }
  }

  function on(event, handler) {
    client.on(event, (...args) => handler(...args).catch(async error => {
      console.error('Discord event failed:', event, error.code || error.name);
      if (event === Events.InteractionCreate && args[0].deferred && !args[0].replied) {
        await args[0].editReply('操作未完成，请检查 Bot 的频道与身份组权限。').catch(() => {});
      }
    }));
  }

  async function awardRole(member, xp, config) {
    if (!config.role || level(xp) < config.rewardLevel || member.roles.cache.has(config.role)) return;
    const role = member.guild.roles.cache.get(config.role);
    if (!allowedRole(role)) return;
    await member.roles.add(role, 'GuildBase XP reward');
    const obsolete = config.replaceRoles.filter(id => id !== role.id && member.roles.cache.has(id) && allowedRole(member.guild.roles.cache.get(id)));
    if (obsolete.length) await member.roles.remove(obsolete, 'GuildBase XP reward');
    await store.log(member.guild.id, 'reward', member.user.username + ' 获得等级身份组 ' + role.name);
  }

  async function award(member, amount, config) {
    const xp = await store.award(member.guild.id, member.id, member.displayName, amount);
    await awardRole(member, xp, config).catch(error => console.error('XP reward role update failed:', error.code || error.name));
  }

  async function audit(guild, kind, message) {
    await store.log(guild.id, kind, message);
    const config = await store.settings(guild.id, true);
    const channel = guild.channels.cache.get(config.logChannel);
    if (channel?.isSendable()) {
      await channel.send({ content: message.slice(0, 500), allowedMentions: { parse: [] } }).catch(error => {
        console.error('Discord log channel unavailable:', error.code || error.name);
      });
    }
  }

  function reconcileVoice(guild) {
    const before = voiceQueue.get(guild.id) || Promise.resolve();
    const next = before.catch(() => {}).then(async () => {
      const config = await store.settings(guild.id, true);
      const now = Date.now();
      const active = voices.get(guild.id) || new Map();
      voices.set(guild.id, active);
      for (const [id, entry] of active) {
        const current = guild.voiceStates.cache.get(id);
        const continues = config.voice && eligibleVoice(current, config);
        const minutes = Math.floor((now - entry.since) / 60000);
        if (minutes > 0) {
          await award(entry.member, minutes * entry.rate, config);
          entry.since += minutes * 60000;
        }
        if (!continues) active.delete(id);
        else if (entry.rate !== config.voiceRate) active.set(id, { since: now, rate: config.voiceRate, member: current.member });
      }
      if (config.voice) {
        for (const voice of guild.voiceStates.cache.values()) {
          if (!active.has(voice.id) && eligibleVoice(voice, config)) {
            active.set(voice.id, { since: now, rate: config.voiceRate, member: voice.member });
          }
        }
      }
    });
    voiceQueue.set(guild.id, next);
    return next.finally(() => {
      if (voiceQueue.get(guild.id) === next) voiceQueue.delete(guild.id);
    });
  }

  on(Events.ClientReady, async () => {
    try {
      await registerBuiltinCommands(client, { devGuildId });
    } finally {
      for (const guild of client.guilds.cache.values()) await reconcileVoice(guild).catch(() => {});
      clearInterval(ticker);
      ticker = setInterval(() => {
        for (const guild of client.guilds.cache.values()) {
          if (guild.voiceStates.cache.size || voices.get(guild.id)?.size) reconcileVoice(guild).catch(() => {});
        }
      }, 30000);
      ticker.unref();
    }
  });
  on(Events.VoiceStateUpdate, async (oldState, newState) => reconcileVoice(newState.guild));
  on(Events.GuildDelete, async guild => { voices.delete(guild.id); });

  async function handleMessage(message) {
    if (!message.inGuild() || message.author.bot || !message.member || message.webhookId || message.system) return;
    const { guild, member } = message;
    const config = await store.settings(guild.id, true);
    if (!member.permissions.has(Permission.ManageMessages)) {
      if (capabilities.messageContentIntent && message.content) {
        const reason = moderatorRule(message.content, config);
        if (reason) {
          if (message.deletable) await message.delete();
          await audit(guild, 'moderation', member.user.username + ' 的消息命中规则：' + reason);
          return;
        }
      }
      if (config.floodCount && await store.flood(guild.id, member.id, config.floodCount)) {
        if (member.moderatable) {
          await member.timeout(config.timeoutSeconds * 1000, 'GuildBase flood protection');
          await audit(guild, 'moderation', member.user.username + ' 因刷屏被禁言');
        } else {
          await audit(guild, 'moderation', member.user.username + ' 触发刷屏规则，Bot 没有禁言权限');
        }
        if (message.deletable) await message.delete();
        return;
      }
    }
    if (capabilities.messageContentIntent && message.content) {
      let handled = false;
      const trigger = message.content.trim().toLowerCase();
      if (Object.hasOwn(config.triggers || {}, trigger)) {
        const command = await store.command(guild.id, config.triggers[trigger]);
        if (command?.trigger === trigger && permitted(member, command)) {
          handled = true;
          if (await allowReply(guild.id, member.id)) await message.reply(payload(command));
        }
      }
      if (!handled && config.prefixEnabled) {
        const parsed = parsePrefixCommand(message.content, config.prefix);
        if (parsed && builtinNames.has(parsed.name)) {
          if (await allowReply(guild.id, member.id)) {
            const replyPayload = await runBuiltin(parsed.name, { guild, member, createdTimestamp: message.createdTimestamp });
            if (replyPayload) await message.reply(replyPayload);
          }
        }
      }
    }
    if (config.text && !config.ignore.includes(message.channelId) && !config.ignoreRoles.some(role => member.roles.cache.has(role)) &&
      await store.cooldown(guild.id, member.id, config.cooldown)) {
      await award(member, config.textRate, config);
    }
  }
  on(Events.MessageCreate, handleMessage);

  on(Events.GuildMemberAdd, async member => {
    const config = await store.settings(member.guild.id, true);
    await audit(member.guild, 'join', member.user.username + ' 加入了服务器');
    if (!config.welcome || member.user.bot) return;
    const role = member.guild.roles.cache.get(config.welcomeRole);
    if (allowedRole(role)) await member.roles.add(role, 'GuildBase welcome role');
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (channel?.isSendable()) {
      const content = config.welcomeMessage.replaceAll('{user}', '<@' + member.id + '>').replaceAll('{server}', member.guild.name);
      const image = card('WELCOME', member.displayName, member.guild.name);
      await channel.send({ content, files: [new AttachmentBuilder(image, { name: 'welcome.png' })], allowedMentions: { users: [member.id] } });
    }
  });
  on(Events.GuildMemberRemove, async member => audit(member.guild, 'leave', member.user.username + ' 离开了服务器'));
  on(Events.MessageUpdate, async (before, after) => {
    if (after.guild && !after.author?.bot && before.content !== after.content) {
      await audit(after.guild, 'edit', '频道 #' + (after.channel?.name || after.channelId) + ' 有消息被编辑 · ' + after.id);
    }
  });
  on(Events.MessageDelete, async message => {
    if (message.guild && !message.author?.bot) await audit(message.guild, 'delete', '频道 #' + (message.channel?.name || message.channelId) + ' 有消息被删除 · ' + message.id);
  });

  on(Events.MessageBulkDelete, async (messages, channel) => {
    if (channel.guild) await audit(channel.guild, 'delete', '频道 #' + (channel.name || channel.id) + ' 批量删除了 ' + messages.size + ' 条消息');
  });

  function permitted(member, command) {
    return !command.roles?.length || command.roles.some(id => member.roles.cache.has(id));
  }

  async function handleInteraction(interaction) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('guildbase:role:')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const config = await store.settings(guild.id);
      const roleId = interaction.isStringSelectMenu() ? interaction.values[0] : interaction.customId.split(':').at(-1);
      const role = guild.roles.cache.get(roleId);
      if (interaction.message.id !== config.panelId || !config.selfRoles.includes(roleId) || !allowedRole(role)) {
        await interaction.editReply('此身份组当前不可领取。');
        return;
      }
      const member = await guild.members.fetch({ user: interaction.user.id, force: true });
      const remove = member.roles.cache.has(roleId);
      if (remove) await member.roles.remove(role);
      else await member.roles.add(role);
      await interaction.editReply((remove ? '已取消 ' : '已领取 ') + role.name);
      await store.log(guild.id, 'roles', member.user.username + (remove ? ' 取消了 ' : ' 领取了 ') + role.name);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;
    await interaction.deferReply(name === 'daily' || name === 'setup' ? { flags: MessageFlags.Ephemeral } : {});
    const member = await guild.members.fetch(interaction.user.id);
    if (builtinNames.has(name)) {
      const replyPayload = await runBuiltin(name, { guild, member, createdTimestamp: interaction.createdTimestamp });
      await interaction.editReply(replyPayload);
      return;
    }
    const command = await store.command(guild.id, name);
    await interaction.editReply(command && permitted(member, command) ? payload(command) : '此指令不存在，或你没有使用权限。');
  }
  on(Events.InteractionCreate, handleInteraction);

  client.on(Events.Error, error => console.error('Discord connection interrupted:', error.code || error.name));
  return {
    client,
    capabilities,
    handleMessage,
    handleInteraction,
    registerCommands(opts = {}) {
      return registerBuiltinCommands(client, { devGuildId, ...opts });
    },
    async start() {
      const abort = new AbortController();
      const ready = once(client, Events.ClientReady, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]) });
      try { await Promise.all([client.login(token), ready]); }
      finally { abort.abort(); }
    },
    stop() { clearInterval(ticker); client.destroy(); }
  };
}
