'use strict';

window.guildbaseLive = (() => {
  let enabled = false;
  let sequence = 0;
  const tabs = { general: '服务器概览', xp: 'XP 与签到', welcome: '欢迎消息', roles: '自助身份组', moderation: '自动管理', commands: '自定义指令', logs: '服务器日志' };
  const periods = { 0: '总榜', 7: '7 日榜', 30: '30 日榜' };
  const logTypes = { settings: '设置', reward: '奖励', roles: '身份组', commands: '指令', moderation: '自动管理', join: '加入', leave: '离开', edit: '消息编辑', delete: '消息删除' };
  const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' });
  const fmt = new Intl.NumberFormat('en-MY');
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const demo = () => location.hash.startsWith('#/live-demo');
  const dashboard = (id, tab = 'general') => (demo() ? '#/live-demo/' : '#/live/') + id + '/' + tab;
  const boardLink = (id, days = 0) => '#/live-board/' + id + '/' + days;
  const text = (label, name, value, limit, type = 'text') => `<label class="field">${label}<input type="${type}" name="${name}" value="${h(value)}" maxlength="${limit}"></label>`;
  const area = (label, name, value, limit) => `<label class="field">${label}<textarea name="${name}" maxlength="${limit}" rows="3">${h(value)}</textarea></label>`;
  const count = (label, name, value, min, max) => `<label class="field">${label}<input type="number" name="${name}" value="${h(value)}" min="${min}" max="${max}" required></label>`;
  const checkbox = (label, name, value) => `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}>${label}</label>`;
  const options = (items, selected) => items.map(item => `<option value="${h(item.id)}" ${selected.includes(item.id) ? 'selected' : ''}>${h(item.name)}</option>`).join('');
  const select = (label, name, items, value = '') => `<label class="field">${label}<select name="${name}"><option value="">未设置</option>${options(items,[value])}</select></label>`;
  const multiselect = (label, name, items, values) => `<fieldset class="choices"><legend>${label}</legend><input type="hidden" data-list="${name}" name="${name}">${items.map(item =>
    `<label class="check"><input type="checkbox" data-list="${name}" name="${name}" value="${h(item.id)}" ${values.includes(item.id) ? 'checked' : ''}>${h(item.name)}</label>`).join('') || '<p class="subtle">没有可选项目</p>'}</fieldset>`;
  const panel = (title, description, body) => `<section class="panel"><div class="panel-head"><h2>${title}</h2><p>${description}</p></div>${body}</section>`;
  const save = (label = '保存设置') => `<div class="form-actions"><button class="button" type="submit">${label}</button></div>`;
  const page = (title, desc, body) => `<div class="frame page"><header class="intro"><h1>${title}</h1><p>${desc}</p></header>${body}</div>`;

  function demoRequest(path, method, body) {
    const id = '100000000000000001';
    const channels = [
      { id: '100000000000000011', name: '综合聊天', sendable: true },
      { id: '100000000000000012', name: '欢迎频道', sendable: true },
      { id: '100000000000000013', name: '语音大厅', sendable: false }
    ];
    const roles = [
      { id: '100000000000000021', name: '活动通知', assignable: true },
      { id: '100000000000000022', name: '活跃成员', assignable: true },
      { id: '100000000000000023', name: '管理员', assignable: false }
    ];
    const defaults = { text: true, voice: true, textRate: 15, voiceRate: 5, cooldown: 60, dailyXP: 25, rewardLevel: 10,
      role: '', replaceRoles: [], ignore: [], ignoreRoles: [], public: false, welcome: false, welcomeChannel: '', welcomeRole: '',
      welcomeMessage: '欢迎 {user} 加入 {server}！', roleChannel: '', roleStyle: 'buttons', roleMessage: '', selfRoles: [],
      blockedTerms: '', blockInvites: false, floodCount: 0, timeoutSeconds: 60, logChannel: '' };
    const key = 'guildbase:full-demo:1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const config = { ...defaults, ...data.config };
    const commands = data.commands || [];
    const logs = data.logs || [];
    const persist = (kind, message) => localStorage.setItem(key, JSON.stringify({
      config, commands, logs: [{ kind, message, created_at: new Date().toISOString() }, ...logs].slice(0, 100)
    }));
    if (method === 'GET' && path === '/api/guilds') return { guilds: [{ id, name: '社区测试服', installed: true }] };
    const base = '/api/guilds/' + id;
    if (method === 'GET' && path === base) return { name: '社区测试服', channels, roles, config, commands, logs };
    if (method === 'PATCH' && path === base + '/settings') {
      if (body.floodCount === 1) throw new Error('刷屏阈值必须为 0 或至少 2 条。');
      Object.assign(config, body);
      persist('settings', '保存了服务器设置');
      return;
    }
    if (method === 'POST' && path === base + '/panel') {
      if (!config.roleChannel || !config.selfRoles.length) throw new Error('请先选好频道和身份组，再保存设置。');
      persist('roles', '预览了自助身份组面板');
      return { preview: config.roleMessage || '选择你想领取或取消的身份组。', roles: roles.filter(role => config.selfRoles.includes(role.id)), style: config.roleStyle };
    }
    if (method === 'POST' && path === base + '/commands') {
      if (!/^[a-z0-9_-]{1,32}$/.test(body.name) || ['daily','rank','leaderboard'].includes(body.name) ||
        (!body.slash && !body.trigger.trim()) || ![body.reply,body.embedTitle,body.embedDescription].some(value => value.trim())) {
        throw new Error('请检查指令名称、触发方式和回复内容。');
      }
      const index = commands.findIndex(command => command.name === body.name);
      if (index >= 0) commands[index] = body;
      else commands.push(body);
      persist('commands', '保存了 /' + body.name);
      return;
    }
    if (method === 'DELETE' && path.startsWith(base + '/commands/')) {
      const name = decodeURIComponent(path.split('/').at(-1));
      const index = commands.findIndex(command => command.name === name);
      if (index >= 0) commands.splice(index, 1);
      persist('commands', '删除了 /' + name);
      return;
    }
    throw new Error('请返回选择演示服务器。');
  }

  async function request(path, method = 'GET', body) {
    if (demo()) return demoRequest(path, method, body);
    const response = await fetch(path, {
      method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 204) return undefined;
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || '请求失败。'), { status: response.status });
    return data;
  }

  function announce(message) {
    const status = document.querySelector('#live-status');
    if (status) status.textContent = message;
  }

  function values(form) {
    const data = {};
    for (const field of form.elements) {
      if (!field.name) continue;
      if (field.hasAttribute('data-list')) {
        data[field.name] ??= [];
        if (field.checked) data[field.name].push(field.value);
      } else if (field.type === 'checkbox') {
        data[field.name] = field.checked;
      } else if (field.type === 'number') {
        data[field.name] = field.valueAsNumber;
      } else {
        data[field.name] = field.value;
      }
    }
    return data;
  }

  async function operate(button, work) {
    button.disabled = true;
    announce('处理中…');
    try { await work(); }
    catch (error) { announce(error.message); }
    finally { button.disabled = false; }
  }

  function renderServers(data) {
    return page(demo() ? '完整控制台演示' : 'Discord 服务器', demo() ? '试用正式版设置。更改保存在当前浏览器。' : '已登录为 ' + h(data.profile),
      '<section class="panel stack">' + (demo() ? '' : '<div class="form-actions"><button type="button" id="live-logout" class="button secondary">退出登录</button></div>') +
      (data.guilds.map(guild => `<div class="server-row"><div><strong>${h(guild.name)}</strong><p class="subtle">${demo() ? '模拟服务器' : guild.installed ? 'Bot 已连接' : '尚未安装 Bot'}</p></div>
        ${guild.installed ? `<a class="button" href="${dashboard(guild.id)}">进入配置</a>` : `<a class="button" href="${h(guild.invite)}" target="_blank" rel="noopener noreferrer">邀请 Bot</a>`}</div>`
      ).join('') || '<p>没有找到可以管理的 Discord 服务器。</p>') + '<output id="live-status" aria-live="polite"></output></section>');
  }

  function renderGuild(id, tab, data) {
    const c = data.config;
    const sendable = data.channels.filter(channel => channel.sendable);
    const manageable = data.roles.filter(role => role.assignable);
    function settingForm(inner) { return '<form id="live-settings">' + inner + save() + '</form>'; }
    let body;
    switch (tab) {
      case 'xp':
        body = panel('XP 与签到', '发言和语音 XP 自动统计，签到周期按马来西亚时间计算。', settingForm(
          checkbox('启用文字 XP', 'text', c.text) + checkbox('启用语音 XP', 'voice', c.voice) +
          '<div class="form-grid">' + count('每次发言 XP', 'textRate', c.textRate, 1, 100) +
          count('每分钟语音 XP', 'voiceRate', c.voiceRate, 1, 100) + count('发言冷却（秒）', 'cooldown', c.cooldown, 5, 600) +
          count('签到基础 XP', 'dailyXP', c.dailyXP, 1, 1000) + count('奖励所需等级', 'rewardLevel', c.rewardLevel, 1, 1000) +
          select('等级奖励身份组', 'role', manageable, c.role) + '</div>' +
          multiselect('升级后移除的身份组', 'replaceRoles', manageable, c.replaceRoles) +
          multiselect('忽略的频道', 'ignore', data.channels, c.ignore) + multiselect('忽略的身份组', 'ignoreRoles', data.roles, c.ignoreRoles)));
        break;
      case 'welcome':
        body = panel('欢迎消息', '支持 {user} 和 {server}。Bot 会随欢迎消息发送 PNG 欢迎卡。', settingForm(
          checkbox('启用迎新', 'welcome', c.welcome) + select('欢迎频道', 'welcomeChannel', sendable, c.welcomeChannel) +
          select('新人自动身份组', 'welcomeRole', manageable, c.welcomeRole) +
          area('欢迎文案', 'welcomeMessage', c.welcomeMessage, 400) + '<p class="mini-rank" id="live-welcome-preview"></p>'));
        break;
      case 'roles':
        body = panel('自助身份组', '先保存设置，再把面板发布到指定频道。成员点击可领取或取消。', settingForm(
          select('发布频道', 'roleChannel', sendable, c.roleChannel) +
          `<label class="field">面板样式<select name="roleStyle">${options([{ id:'buttons',name:'按钮' },{ id:'select',name:'下拉菜单' }],[c.roleStyle])}</select></label>` +
          area('面板说明', 'roleMessage', c.roleMessage, 400) + multiselect('可自助领取的身份组', 'selfRoles', manageable, c.selfRoles)) +
          '<div class="form-actions"><button class="button secondary" id="live-publish" type="button">' + (demo() ? '预览频道面板' : '发布到 Discord') + '</button><a id="live-panel-link" hidden target="_blank" rel="noopener noreferrer">打开面板</a></div><div class="embed-preview" id="role-preview" hidden></div>');
        break;
      case 'moderation':
        body = panel('自动管理', '屏蔽词可以用逗号或换行隔开。刷屏阈值填 0 关闭，启用时填至少 2。', settingForm(
          checkbox('拦截 Discord 邀请链接', 'blockInvites', c.blockInvites) + area('屏蔽词', 'blockedTerms', c.blockedTerms, 500) +
          '<div class="form-grid">' + count('10 秒内的刷屏阈值', 'floodCount', c.floodCount, 0, 30) +
          count('Timeout 时长（秒）', 'timeoutSeconds', c.timeoutSeconds, 10, 3600) + '</div>'));
        break;
      case 'commands':
        body = panel('自定义指令', '可设置文字触发词、斜杠命令、使用身份组和 Embed 卡片。', renderCommands(data));
        break;
      case 'logs':
        body = panel('服务器日志', '最近 100 条记录，时间使用马来西亚时区。', settingForm(select('同时发送日志到频道', 'logChannel', sendable, c.logChannel)) +
          '<label class="field">筛选类型<select id="live-log-filter"><option value="">所有类型</option>' + options(Object.entries(logTypes).map(([id, name]) => ({ id, name })),[]) + '</select></label>' +
          '<div class="table-wrap"><table><thead><tr><th scope="col">时间</th><th scope="col">类型</th><th scope="col">操作</th></tr></thead><tbody id="log-rows">' + logs(data.logs) + '</tbody></table></div>');
        break;
      default:
        body = panel('服务器概览', demo() ? '更改保存在此浏览器，可在左侧配置模拟服务器。' : 'Bot 已连接，你可以在左侧配置服务器功能。', settingForm(checkbox('公开 XP 排行榜', 'public', c.public)) +
          '<div class="form-actions"><a class="button secondary" href="' + (demo() ? '#/leaderboard' : boardLink(id)) + '">' + (demo() ? '查看榜单演示' : '打开真实排行榜') + '</a></div>');
    }
    return page(h(data.name), demo() ? '完整控制台演示' : 'Discord 控制台', '<div class="grid"><nav class="panel side" aria-label="真实控制台菜单">' +
      '<a href="' + (demo() ? '#/live-demo' : '#/live') + '">选择服务器</a>' + Object.entries(tabs).map(([key, title]) => `<a href="${dashboard(id,key)}" ${key === tab ? 'aria-current="page"' : ''}>${title}</a>`).join('') +
      '</nav><div class="stack">' + body + '<output id="live-status" aria-live="polite"></output></div></div>');
  }

  function logs(rows, filter = '') {
    return rows.filter(item => !filter || item.kind === filter).map(item =>
      `<tr><td>${time.format(new Date(item.created_at))}</td><td>${logTypes[item.kind] || '其他'}</td><td>${h(item.message)}</td></tr>`
    ).join('') || '<tr><td colspan="3">没有相关记录。</td></tr>';
  }

  function renderCommands(data) {
    return '<form id="live-command">' + text('指令名称（小写字母、数字、- 或 _）', 'name', '', 32) +
      checkbox('注册为 Discord 斜杠指令', 'slash', true) + text('文字触发词', 'trigger', '', 80) +
      area('纯文字回复', 'reply', '', 1800) + multiselect('限制可用身份组（全不选即不限）', 'roles', data.roles, []) +
      text('Embed 标题', 'embedTitle', '', 256) + area('Embed 正文', 'embedDescription', '', 2000) +
      text('Embed 边框颜色', 'embedColor', '#b9b1ff', 7, 'color') + '<div class="embed-preview" id="embed-preview" aria-live="polite"></div>' + save('保存指令') +
      '</form><ul id="live-command-list" class="command-list">' + data.commands.map(command => `<li><div><strong>/${h(command.name)}</strong><p>${h(command.trigger || command.embedTitle || command.reply)}</p></div>
        <div><button type="button" class="button secondary" data-edit="${h(command.name)}">编辑</button> <button type="button" class="button danger" data-remove="${h(command.name)}">删除</button></div></li>`).join('') +
      '</ul>';
  }

  function bindGuild(id, tab, data, main) {
    const base = '/api/guilds/' + id;
    const form = document.querySelector('#live-settings');
    form?.addEventListener('submit', event => {
      event.preventDefault();
      operate(event.submitter, async () => {
        await request(base + '/settings', 'PATCH', values(form));
        announce('设置已保存。');
      });
    });
    if (tab === 'welcome') {
      const preview = () => { document.querySelector('#live-welcome-preview').textContent = form.elements.welcomeMessage.value.replaceAll('{user}', '@新成员').replaceAll('{server}', data.name); };
      form.addEventListener('input', preview);
      preview();
    }
    document.querySelector('#live-publish')?.addEventListener('click', event => operate(event.currentTarget, async () => {
      const result = await request(base + '/panel', 'POST');
      if (result.preview) {
        const box = document.querySelector('#role-preview');
        box.hidden = false;
        const choices = result.roles.map(role => '<option>' + h(role.name) + '</option>').join('');
        box.innerHTML = '<p>' + h(result.preview) + '</p>' + (result.style === 'select'
          ? '<select aria-label="预览身份组">' + choices + '</select>'
          : '<div class="form-actions">' + result.roles.map(role => '<button type="button" class="button secondary" aria-pressed="false">' + h(role.name) + '</button>').join('') + '</div>');
        box.addEventListener('click', event => {
          if (event.target.matches('button')) event.target.setAttribute('aria-pressed', String(event.target.getAttribute('aria-pressed') !== 'true'));
        });
        announce('演示面板已生成。');
        return;
      }
      const link = document.querySelector('#live-panel-link');
      link.href = result.url;
      link.hidden = false;
      announce('已发布到 Discord。');
    }));
    document.querySelector('#live-log-filter')?.addEventListener('change', event => {
      document.querySelector('#log-rows').innerHTML = logs(data.logs, event.target.value);
    });
    const commandForm = document.querySelector('#live-command');
    if (!commandForm) return;
    const preview = () => {
      const box = document.querySelector('#embed-preview');
      const current = values(commandForm);
      box.style.borderColor = current.embedColor;
      box.innerHTML = '<strong>' + h(current.embedTitle) + '</strong><p>' + h(current.embedDescription) + '</p>';
      box.hidden = !current.embedTitle && !current.embedDescription;
    };
    preview();
    commandForm.addEventListener('input', preview);
    commandForm.addEventListener('submit', event => {
      event.preventDefault();
      operate(event.submitter, async () => {
        const input = values(commandForm);
        input.roles ??= [];
        await request(base + '/commands', 'POST', input);
        await render(main);
        announce('指令已保存。');
      });
    });
    document.querySelector('#live-command-list').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.remove) {
        if (!window.confirm('删除 /' + button.dataset.remove + '？')) return;
        operate(button, async () => {
          await request(base + '/commands/' + encodeURIComponent(button.dataset.remove), 'DELETE');
          await render(main);
          announce('指令已删除。');
        });
        return;
      }
      const command = data.commands.find(item => item.name === button.dataset.edit);
      for (const field of commandForm.elements) {
        if (field.hasAttribute('data-list')) field.checked = command.roles.includes(field.value);
        else if (field.name === 'slash') field.checked = command.slash;
        else if (field.name) field.value = command[field.name];
      }
      preview();
      commandForm.elements.name.focus();
    });
  }

  function renderBoard(id, days, data) {
    return page('社区排行榜', h(data.name),
      '<section class="panel"><div class="toolbar"><nav class="pills" aria-label="真实榜单周期">' +
      Object.entries(periods).map(([key, title]) => `<a href="${boardLink(id,key)}" ${Number(key) === days ? 'aria-current="page"' : ''}>${title}</a>`).join('') +
      '</nav><form id="live-search"><label class="field">搜索成员<input name="search" type="search" maxlength="80"></label><button class="button secondary" type="submit">搜索</button></form></div>' +
      '<div class="table-wrap"><table><thead><tr><th scope="col">名次</th><th scope="col">成员</th><th scope="col">等级</th><th scope="col">XP</th></tr></thead><tbody id="live-rank">' +
      boardRows(data.rows) + '</tbody></table></div><output id="live-status" aria-live="polite"></output></section>');
  }

  function boardRows(rows) {
    return rows.map(row => `<tr><td>${row.pos}</td><th scope="row">${h(row.name)}</th><td>${row.level}</td><td>${fmt.format(row.score)}</td></tr>`).join('') || '<tr><td colspan="4">没有符合的排行记录。</td></tr>';
  }

  async function render(main) {
    const current = ++sequence;
    const [mode, id, section] = location.hash.slice(2).split('/');
    const board = mode === 'live-board';
    const days = [7, 30].includes(Number(section)) ? Number(section) : 0;
    const tab = Object.hasOwn(tabs, section) ? section : 'general';
    main.innerHTML = page('Discord 控制台', '正在读取数据…', '');
    try {
      if (!enabled && !demo()) {
        main.innerHTML = page('Discord 接入', '正式版配置完成后，即可在这里登录 Discord 并管理服务器。', panel('开放演示', '你可以先试用网页里的各项设置和预览。', '<a class="button" href="#/dashboard">体验演示控制台</a>'));
        return;
      }
      const base = board ? '/api/leaderboard/' : '/api/guilds';
      const endpoint = board ? base + encodeURIComponent(id) + '?days=' + days : base + (id ? '/' + encodeURIComponent(id) : '');
      const data = await request(endpoint);
      if (current !== sequence || !location.hash.startsWith('#/live')) return;
      if (board) {
        main.innerHTML = renderBoard(id, days, data);
        document.querySelector('#live-search').addEventListener('submit', event => {
          event.preventDefault();
          const term = new FormData(event.currentTarget).get('search');
          operate(event.submitter, async () => {
            const result = await request(endpoint + '&search=' + encodeURIComponent(term));
            const body = document.querySelector('#live-rank');
            if (body) body.innerHTML = boardRows(result.rows);
            announce('');
          });
        });
      } else if (id) {
        main.innerHTML = renderGuild(id, tab, data);
        bindGuild(id, tab, data, main);
      } else {
        main.innerHTML = renderServers(data);
        document.querySelector('#live-logout')?.addEventListener('click', event => operate(event.currentTarget, async () => {
          await request('/api/logout', 'POST');
          await render(main);
        }));
      }
    } catch (error) {
      if (current !== sequence || !location.hash.startsWith('#/live')) return;
      main.innerHTML = page(board ? '社区排行榜' : 'Discord 控制台', h(error.message), !board && error.status === 401
        ? '<a class="button" href="/auth/discord">使用 Discord 登录</a>' : '<a class="button secondary" href="#/live">返回控制台</a>');
    }
  }

  return { enable() { enabled = true; }, render };
})();
