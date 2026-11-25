'use strict';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const key = 'guildbase:demo:2';
const servers = [
  { id: 'arcade', name: '深夜游戏厅', users: ['Milo', 'Luna', 'Jackie', 'Nori', 'Kai', 'Nova'] },
  { id: 'studio', name: '创作者工作室', users: ['Jade', 'Ray', 'Sunny', 'Ash'] }
];
const channels = ['综合聊天', '机器人指令', '语音大厅', '欢迎新成员'];
const roles = ['活跃成员', '社区达人', '资深成员'];
const selfRoles = ['活动通知', '组队邀请', '直播通知'];
const logLabels = { settings: '设置', xp: 'XP', roles: '身份组', moderation: '自动管理', commands: '指令' };
const logTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Kuala_Lumpur', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const periods = { all: '总榜', week: '7 日榜', month: '30 日榜' };
const settingsPages = { overview: '服务器概览', xp: 'XP 设置', welcome: '欢迎消息', roles: '自助身份组', moderation: '自动管理', commands: '自定义指令', logs: '操作日志' };
const usersDemoXP = [14400, 11620, 9730, 7490, 5730, 4250];
const number = new Intl.NumberFormat('en-MY');
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' });
const localDay = () => dayFormatter.format(new Date());
const dayMs = 86400000;
const level = xp => Math.floor(Math.sqrt(xp / 100));

function defaults() {
  return { text: true, voice: true, textRate: 15, voiceRate: 5, ignore: '', rewardLevel: 10, role: '活跃成员', public: true, welcome: false, welcomeChannel: '欢迎新成员', welcomeMessage: '欢迎 {user} 加入 {server}！', selfRoles: [], blockedTerms: '', blockInvites: false, customCommands: [] };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

let state = load();
let timer;
function persist(message) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    announce(message);
  } catch {
    announce('本次打开网页时有效，浏览器未能保存数据。');
  }
}

function announce(message) {
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { notice.hidden = true; }, 4300);
}

function escapeHTML(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

function settings(server) {
  return { ...defaults(), ...state[server.id]?.settings };
}

function route() {
  const [page, serverId, option] = location.hash.slice(2).split('/');
  const server = servers.find(item => item.id === serverId) || servers[0];
  return { page, server, option };
}

const boardURL = (server, period = 'all') => '#/leaderboard/' + server.id + '/' + period;
const dashboardURL = (server, section = 'overview') => '#/dashboard/' + server.id + '/' + section;
const optionList = (items, value) => items.map(item => '<option' + (item === value ? ' selected' : '') + '>' + item + '</option>').join('');

function serverPicker(server) {
  return '<label class="field">演示服务器<select id="server">' + servers.map(item =>
    '<option value="' + item.id + '"' + (item === server ? ' selected' : '') + '>' + item.name + '</option>'
  ).join('') + '</select></label>';
}

function avatar(name, index) {
  const color = ['', 'mint', 'peach', 'blue'][index % 4];
  return '<span class="avatar ' + color + '" aria-hidden="true">' + name[0] + '</span>';
}

function home() {
  return `
  <div class="frame">
    <section class="hero">
      <div>
        <div class="eyebrow">Discord 社区管理</div>
        <h1>让社区活跃度<span>看得见。</span></h1>
        <p>成员发言和开麦就能累积 XP。给活跃成员发放身份组奖励，让大家在排行榜上看到自己的进度。</p>
        <div class="actions"><a class="button" href="#/dashboard">体验控制台</a><a class="button secondary" href="#/leaderboard">查看排行榜</a></div><a class="more-demo" href="#/live-demo">查看完整控制台演示</a>
      </div>
      <aside class="graph-card" aria-label="等级卡与社区活动示例">
        <div class="graph-top"><strong>深夜游戏厅</strong><span>演示数据</span></div>
        <div class="graph-body">
          <div class="mini-rank">${avatar('Luna',0)}<div><strong>Luna</strong><div class="caption">11,620 / 12,100 XP</div><div class="progress" aria-hidden="true"><span></span></div></div><span class="level">等级 10</span></div>
          <div class="graph-title"><h3>本周活动</h3><span class="caption">社区 XP</span></div>
          <div class="chart" aria-hidden="true"><i style="--h:32%"></i><i style="--h:49%"></i><i style="--h:38%"></i><i style="--h:63%"></i><i style="--h:54%"></i><i style="--h:80%"></i><i style="--h:94%"></i></div>
          <div class="week" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        </div>
      </aside>
    </section>
    <section class="section"><h2>社区工具</h2><div class="cards">
      <a class="feature" href="#/dashboard/arcade/xp"><span class="glyph" aria-hidden="true">◇</span><h3>等级与奖励</h3><p>设定聊天和语音 XP，达到指定等级后发放身份组。</p></a>
      <a class="feature" href="#/leaderboard"><span class="glyph" aria-hidden="true">≡</span><h3>社区排行榜</h3><p>查看总榜、7 日榜和 30 日榜，也可以搜索成员。</p></a>
      <a class="feature" href="#/dashboard/arcade/welcome"><span class="glyph" aria-hidden="true">✦</span><h3>欢迎消息</h3><p>编辑欢迎文案，在控制台预览新人入群时看到的消息。</p></a>
      <a class="feature" href="#/dashboard/arcade/roles"><span class="glyph" aria-hidden="true">＋</span><h3>自助身份组</h3><p>配置成员可以自行领取或取消的身份组。</p></a>
      <a class="feature" href="#/dashboard/arcade/moderation"><span class="glyph" aria-hidden="true">⊘</span><h3>自动管理</h3><p>设置屏蔽词与邀请链接过滤，试测消息是否被拦截。</p></a>
      <a class="feature" href="#/dashboard/arcade/commands"><span class="glyph" aria-hidden="true">/</span><h3>自定义指令</h3><p>为常见问题设置快捷回复，并试跑指令。</p></a>
    </div></section>
  </div>`;
}

function check(name, title, checked, value = "on") {
  return '<label class="check"><input type="checkbox" name="' + name + '" value="' + escapeHTML(value) + '"' + (checked ? ' checked' : '') + '>' + title + '</label>';
}


function communityPanel(server, section, config) {
  switch (section) {
    case 'roles': {
      const assigned = state[server.id]?.assignedRoles || [];
      const memberButtons = config.selfRoles.map(role =>
        '<button type="button" class="button secondary" data-role="' + role + '" aria-pressed="' + assigned.includes(role) + '">' +
        (assigned.includes(role) ? '取消' : '领取') + '「' + role + '」</button>'
      ).join('');
      return `<div class="panel-head"><h2>自助身份组</h2><p>选择允许成员自行领取的身份组，然后用 ${server.users[0]} 测试。</p></div>
      <form id="roles-form">
        ${selfRoles.map(role => check('selfRole', role, config.selfRoles.includes(role), role)).join('')}
        <div class="form-actions"><button class="button" type="submit">保存身份组设置</button></div>
      </form>
      <div class="form-actions" id="role-actions">${memberButtons || '<p class="subtle">先勾选并保存至少一个身份组。</p>'}</div>`;
    }
    case 'moderation':
      return `<div class="panel-head"><h2>自动管理</h2><p>配置拦截规则，再输入一条示例消息确认结果。</p></div>
      <form id="moderation-form">
        ${check('blockInvites', '拦截 Discord 邀请链接', config.blockInvites)}
        <label class="field">屏蔽词<input name="blockedTerms" maxlength="300" value="${escapeHTML(config.blockedTerms)}"><small>多个词用逗号隔开，匹配时忽略英文大小写。</small></label>
        <div class="form-actions"><button class="button" type="submit">保存管理规则</button></div>
      </form>
      <form class="stack tool-test" id="moderation-test">
        <label class="field">测试消息<input name="sample" required maxlength="500" placeholder="输入一条示例消息"></label>
        <div><button class="button secondary" type="submit">测试已保存的规则</button></div>
        <output id="moderation-result" aria-live="polite"></output>
      </form>`;
    case 'commands': {
      const entries = config.customCommands.map(({ name, reply }) => `<li><div><strong>/${escapeHTML(name)}</strong><p>${escapeHTML(reply)}</p></div><button class="button danger" type="button" data-remove-command="${escapeHTML(name)}" aria-label="删除 /${escapeHTML(name)}">删除</button></li>`).join('');
      return `<div class="panel-head"><h2>自定义指令</h2><p>用名称和回复文字创建演示指令。保存同名指令即可更新回复。</p></div>
      <form id="command-form">
        <div class="form-grid"><label class="field">指令名<input name="name" required pattern="[a-z0-9_\\-]+" maxlength="32" placeholder="例如 rules"><small>小写英文字母、数字、连字符或下划线。</small></label>
        <label class="field">回复内容<input name="reply" required maxlength="400"></label></div>
        <div class="form-actions"><button class="button" type="submit">保存指令</button></div>
      </form>
      <ul class="command-list" id="command-list">${entries || '<li class="subtle">还没有自定义指令。</li>'}</ul>
      <form class="tool-test" id="command-test"><label class="field">测试指令<input name="sample" required maxlength="33" placeholder="/rules"></label>
      <button class="button secondary" type="submit">运行指令</button><output id="command-result" aria-live="polite"></output></form>`;
    }
    case 'logs':
      return `<div class="panel-head"><h2>操作日志</h2><p>查看此服务器在当前浏览器记录的最近 50 条操作。时间使用马来西亚时区。</p></div>
      <label class="field">筛选类型<select id="log-filter"><option value="">所有类型</option>${Object.entries(logLabels).map(([value, name]) => '<option value="' + value + '">' + name + '</option>').join('')}</select></label>
      <div class="table-wrap"><table><thead><tr><th scope="col">时间</th><th scope="col">类型</th><th scope="col">操作</th></tr></thead><tbody id="log-rows">${logRows(server)}</tbody></table></div>`;
  }
}

function logRows(server, filter = '') {
  const entries = (state[server.id]?.logs || []).filter(entry => !filter || entry.type === filter);
  return entries.map(entry => `<tr><td>${logTime.format(entry.at)}</td><td>${logLabels[entry.type]}</td><td>${escapeHTML(entry.message)}</td></tr>`).join('') ||
    '<tr><td colspan="3">还没有此类型的操作。</td></tr>';
}

function addLog(server, type, message) {
  const item = state[server.id] ??= {};
  item.logs = [{ type, message, at: Date.now() }, ...(item.logs || []).slice(0, 49)];
}

function dashboard(server, section) {
  const config = settings(server);
  let panel;
  if (section === 'xp') {
    panel = `<div class="panel-head"><h2>XP 设置</h2><p>决定成员如何获得 XP 和等级奖励。</p></div>
    <form id="xp-form">
      ${check('text', '启用文字 XP', config.text)}
      ${check('voice', '启用语音 XP', config.voice)}
      <div class="form-grid">
        <label class="field">每次有效发言 XP<input name="textRate" type="number" required min="1" max="100" value="${config.textRate}"></label>
        <label class="field">每分钟有效语音 XP<input name="voiceRate" type="number" required min="1" max="100" value="${config.voiceRate}"></label>
        <label class="field">忽略频道<select name="ignore"><option value="">无</option>${optionList(channels, config.ignore)}</select></label>
        <label class="field">奖励身份组<select name="role">${optionList(roles, config.role)}</select></label>
        <label class="field">发放奖励所需等级<input name="rewardLevel" type="number" required min="1" max="100" value="${config.rewardLevel}"></label>
      </div>
      <div class="form-actions"><button class="button" type="submit">保存 XP 设置</button><a class="button secondary" href="${dashboardURL(server)}">去测试 XP</a></div>
    </form>`;
  } else if (section === 'welcome') {
    panel = `<div class="panel-head"><h2>欢迎消息</h2><p>编辑文案并查看新人入群的消息预览。</p></div>
    <form id="welcome-form">
      ${check('welcome', '启用欢迎消息', config.welcome)}
      <label class="field">发送频道<select name="welcomeChannel">${optionList(channels, config.welcomeChannel)}</select></label>
      <label class="field">消息内容<input name="welcomeMessage" required maxlength="200" value="${escapeHTML(config.welcomeMessage)}"><small>可用变量 {user} 和 {server}</small></label>
      <div class="mini-rank"><span class="avatar mint" aria-hidden="true">G</span><div><strong id="preview-channel"></strong><p id="welcome-preview"></p></div></div>
      <div class="form-actions"><button class="button" type="submit">保存欢迎设置</button></div>
    </form>`;
  } else if (section !== 'overview') {
    panel = communityPanel(server, section, config);
  } else {
    panel = `<div class="panel-head"><h2>服务器概览</h2><p>这里可以用示范成员测试 XP 设置和排行榜。</p></div>
    <div class="stats"><div class="stat">演示成员<strong>${server.users.length}</strong></div><div class="stat">文字 XP<strong>${config.text ? '开启' : '关闭'}</strong></div><div class="stat">语音 XP<strong>${config.voice ? '开启' : '关闭'}</strong></div></div>
    <form id="sample-form">
      <div class="form-grid">
        <label class="field">成员<select name="member">${optionList(server.users, '')}</select></label>
        <label class="field">活动<select name="activity"><option value="text">发言一次</option><option value="voice">语音一分钟</option></select></label>
        <label class="field">频道<select name="channel">${optionList(channels, '')}</select></label>
      </div>
      <div class="form-actions"><button class="button" type="submit">模拟活动</button><a class="button secondary" href="${boardURL(server)}">查看排行榜</a></div>
    </form>
    <form id="public-form" class="form-actions">
      <label class="check"><input type="checkbox" name="public" ${config.public ? 'checked' : ''}>显示此服务器的排行榜</label>
      <button class="button secondary" type="submit">保存可见性</button>
    </form>`;
  }
  return `<div class="frame page">
    <header class="intro bar"><div><h1>控制台</h1><p>演示模式 · 设置保存在当前浏览器。</p></div>${serverPicker(server)}</header>
    <div class="grid"><nav class="panel side" aria-label="控制台菜单">${Object.entries(settingsPages).map(([id, name]) => '<a href="' + dashboardURL(server, id) + '"' + (id === section ? ' aria-current="page"' : '') + '>' + name + '</a>').join('')}</nav><section class="panel">${panel}</section></div>
  </div>`;
}

function rows(server, period, term = '') {
  const ratios = { all: [1, 1, 1, 1, 1, 1], week: [.07, .04, .13, .05, .08, .09], month: [.31, .21, .30, .48, .24, .33] };
  const config = settings(server);
  const days = { week: 7, month: 30 }[period];
  const cutoff = Date.parse(localDay()) - ((days || 1) - 1) * dayMs;
  const members = server.users.map((name, index) => {
    const daily = Object.entries(state[server.id]?.activity?.[name] || {});
    const bonus = daily.reduce((sum, [, xp]) => sum + xp, 0);
    const periodBonus = days ? daily.reduce((sum, [day, xp]) => sum + (Date.parse(day) >= cutoff ? xp : 0), 0) : bonus;
    const total = usersDemoXP[index] + bonus;
    return { name, index, xp: Math.round(usersDemoXP[index] * ratios[period][index]) + periodBonus, level: level(total) };
  }).sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const shown = members.map((member, index) => ({ ...member, rank: index + 1 }))
    .filter(member => member.name.toLowerCase().includes(term.trim().toLowerCase()));
  return shown.map(member => `<tr><td>${member.rank}</td><th scope="row">${avatar(member.name, member.index)}${member.name}</th><td>${member.level}</td><td>${member.level >= config.rewardLevel ? config.role : '—'}</td><td>${number.format(member.xp)}</td></tr>`).join('') ||
    '<tr><td colspan="5">找不到符合的成员。</td></tr>';
}

function leaderboard(server, period) {
  const config = settings(server);
  const content = config.public ? `<div class="toolbar">
    <nav class="pills" aria-label="榜单周期">${Object.entries(periods).map(([id, name]) => '<a href="' + boardURL(server, id) + '"' + (id === period ? ' aria-current="page"' : '') + '>' + name + '</a>').join('')}</nav>
    <label class="field">搜索成员<input type="search" id="search" placeholder="输入成员名称"></label>
  </div>
  <p class="subtle" id="period-description">${period === 'all' ? '按累计 XP 排名。' : '按近期获得的 XP 排名，按马来西亚时间换日。'}</p>
  <div class="table-wrap"><table aria-describedby="period-description"><thead><tr><th scope="col">名次</th><th scope="col">成员</th><th scope="col">等级</th><th scope="col">奖励身份组</th><th scope="col">XP</th></tr></thead><tbody id="rank-rows">${rows(server, period)}</tbody></table></div>`
  : `<div class="panel-head"><h2>这个排行榜已隐藏</h2><p>可以在演示服务器的控制台重新开启。</p></div><a class="button secondary" href="${dashboardURL(server)}">打开控制台</a>`;
  return `<div class="frame page"><header class="intro bar"><div><h1>社区排行榜<small>${server.name} · 演示数据</small></h1></div>${serverPicker(server)}</header><section class="panel">${content}</section></div>`;
}

function help() {
  return `<div class="frame page"><header class="intro"><h1>使用帮助</h1></header><section class="panel">
    <details open><summary>怎样测试 XP？</summary><p>打开演示控制台，选择服务器。在 XP 设置里改好数值，回服务器概览模拟一次发言或语音，再到排行榜查看结果。</p><a href="#/dashboard" class="button secondary">打开控制台</a></details>
    <details><summary>设置保存在哪里？</summary><p>设置和模拟活动保存在当前浏览器，每个演示服务器独立保存。打开另一台设备会看到初始演示数据。</p></details>
    <details><summary>可以接入自己的 Discord 服务器吗？</summary><p>此版本提供网页操作演示。接入真实服务器需要配置 Discord 应用、登录授权和 Bot 服务。</p></details>
  </section></div>`;
}

function saveConfig(server, values, message) {
  state[server.id] = { ...state[server.id], settings: { ...settings(server), ...values } };
  addLog(server, 'settings', message);
  persist(message);
}

function bindDashboard(server) {
  const xpForm = document.querySelector('#xp-form');
  xpForm?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(xpForm);
    saveConfig(server, {
      text: data.has('text'), voice: data.has('voice'), textRate: Number(data.get('textRate')),
      voiceRate: Number(data.get('voiceRate')), ignore: data.get('ignore'),
      role: data.get('role'), rewardLevel: Number(data.get('rewardLevel'))
    }, 'XP 设置已保存。');
  });
  const welcomeForm = document.querySelector('#welcome-form');
  if (welcomeForm) {
    const preview = () => {
      const data = new FormData(welcomeForm);
      document.querySelector('#preview-channel').textContent = '# ' + data.get('welcomeChannel');
      document.querySelector('#welcome-preview').textContent = data.get('welcomeMessage').replaceAll('{user}', '@' + server.users[0]).replaceAll('{server}', server.name) || '请输入欢迎文案。';
    };
    welcomeForm.addEventListener('input', preview);
    welcomeForm.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(welcomeForm);
      const message = data.get('welcomeMessage').trim();
      if (!message) {
        announce('请输入欢迎文案。');
        welcomeForm.elements.welcomeMessage.focus();
        return;
      }
      saveConfig(server, { welcome: data.has('welcome'), welcomeChannel: data.get('welcomeChannel'), welcomeMessage: message }, '欢迎设置已保存。');
    });
    preview();
  }
  const publicForm = document.querySelector('#public-form');
  publicForm?.addEventListener('submit', event => {
    event.preventDefault();
    const visible = new FormData(publicForm).has('public');
    saveConfig(server, { public: visible }, visible ? '排行榜已显示。' : '排行榜已隐藏。');
  });
  const sample = document.querySelector('#sample-form');
  sample?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(sample);
    const activity = data.get('activity');
    const name = data.get('member');
    const config = settings(server);
    if (!config[activity] || config.ignore === data.get('channel')) {
      announce('根据当前 XP 设置，这次活动没有获得 XP。');
      return;
    }
    const xp = activity === 'text' ? config.textRate : config.voiceRate;
    const item = state[server.id] ??= {};
    const users = item.activity ??= {};
    const user = users[name] ??= {};
    const today = localDay();
    user[today] = (user[today] || 0) + xp;
    const earned = level(usersDemoXP[server.users.indexOf(name)] + Object.values(user).reduce((sum, amount) => sum + amount, 0));
    const reward = earned >= config.rewardLevel ? ' · 达到「' + config.role + '」奖励条件' : '';
    const message = name + ' 获得 ' + xp + ' XP' + reward;
    addLog(server, 'xp', message);
    persist(message);
  });
}


function bindCommunity(server) {
  const rolesForm = document.querySelector('#roles-form');
  rolesForm?.addEventListener('submit', event => {
    event.preventDefault();
    const enabled = new FormData(rolesForm).getAll('selfRole');
    const item = state[server.id] ??= {};
    item.assignedRoles = (item.assignedRoles || []).filter(role => enabled.includes(role));
    saveConfig(server, { selfRoles: enabled }, '身份组设置已保存。');
    render();
    document.querySelector('#roles-form button').focus();
  });
  document.querySelector('#role-actions')?.addEventListener('click', event => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    const role = button.dataset.role;
    const item = state[server.id] ??= {};
    const assigned = new Set(item.assignedRoles || []);
    const removed = assigned.delete(role);
    if (!removed) assigned.add(role);
    item.assignedRoles = [...assigned];
    const action = removed ? '取消' : '领取';
    const message = server.users[0] + ' 已' + action + '「' + role + '」。';
    addLog(server, 'roles', message);
    persist(message);
    button.setAttribute('aria-pressed', String(!removed));
    button.textContent = (removed ? '领取' : '取消') + '「' + role + '」';
  });

  const moderationForm = document.querySelector('#moderation-form');
  moderationForm?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(moderationForm);
    saveConfig(server, { blockedTerms: data.get('blockedTerms').trim(), blockInvites: data.has('blockInvites') }, '自动管理规则已保存。');
  });
  const moderationTest = document.querySelector('#moderation-test');
  moderationTest?.addEventListener('submit', event => {
    event.preventDefault();
    const message = new FormData(moderationTest).get('sample').trim().toLowerCase();
    const config = settings(server);
    const terms = config.blockedTerms.toLowerCase().split(/[,，]/).map(term => term.trim()).filter(Boolean);
    const match = terms.find(term => message.includes(term));
    const invite = config.blockInvites && /\b(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)\S+/i.test(message);
    const verdict = match ? '拦截：命中屏蔽词「' + match + '」。' : invite ? '拦截：检测到 Discord 邀请链接。' : '通过：没有命中已保存的规则。';
    document.querySelector('#moderation-result').textContent = verdict;
    addLog(server, 'moderation', '测试消息 · ' + verdict);
    persist('测试结果已记录。');
  });

  const commandForm = document.querySelector('#command-form');
  commandForm?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(commandForm);
    const name = data.get('name');
    const reply = data.get('reply').trim();
    if (!reply) {
      announce('请输入指令回复。');
      commandForm.elements.reply.focus();
      return;
    }
    const commands = settings(server).customCommands.filter(command => command.name !== name);
    saveConfig(server, { customCommands: [...commands, { name, reply }] }, '指令 /' + name + ' 已保存。');
    render();
    document.querySelector('#command-test input').focus();
  });
  document.querySelector('#command-list')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-command]');
    if (!button) return;
    const name = button.dataset.removeCommand;
    const customCommands = settings(server).customCommands.filter(command => command.name !== name);
    saveConfig(server, { customCommands }, '指令 /' + name + ' 已删除。');
    render();
    document.querySelector('#command-form input').focus();
  });
  const commandTest = document.querySelector('#command-test');
  commandTest?.addEventListener('submit', event => {
    event.preventDefault();
    const name = new FormData(commandTest).get('sample').trim().toLowerCase().replace(/^\//, '');
    const command = settings(server).customCommands.find(item => item.name === name);
    document.querySelector('#command-result').textContent = command ? command.reply : '找不到这条指令。';
    if (command) {
      addLog(server, 'commands', '运行指令 /' + name + '。');
      persist('测试结果已记录。');
    }
  });
  document.querySelector('#log-filter')?.addEventListener('change', event => {
    document.querySelector('#log-rows').innerHTML = logRows(server, event.target.value);
  });
}

function render() {
  const { page, server, option } = route();
  if (page === 'live' || page === 'live-board' || page === 'live-demo') {
    document.title = 'Discord 控制台 · GuildBase';
    window.guildbaseLive.render(main);
    return;
  }
  const period = Object.hasOwn(periods, option) ? option : 'all';
  const section = Object.hasOwn(settingsPages, option) ? option : 'overview';
  const activePage = ['dashboard', 'leaderboard', 'help'].includes(page) ? page : '';
  const titles = { dashboard: '控制台', leaderboard: '社区排行榜', help: '使用帮助' };
  document.title = titles[activePage] ? titles[activePage] + ' · GuildBase' : 'GuildBase · Discord 社区管理';
  main.innerHTML = activePage === 'dashboard' ? dashboard(server, section)
    : activePage === 'leaderboard' ? leaderboard(server, period) : activePage === 'help' ? help() : home();
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === '/' + activePage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.querySelector('#server')?.addEventListener('change', event => {
    const next = servers.find(item => item.id === event.target.value);
    location.hash = page === 'dashboard' ? dashboardURL(next, section) : boardURL(next, period);
  });
  if (activePage === 'dashboard') {
    bindDashboard(server);
    bindCommunity(server);
  }
  if (activePage === 'leaderboard') {
    document.querySelector('#search')?.addEventListener('input', event => {
      document.querySelector('#rank-rows').innerHTML = rows(server, period, event.target.value);
    });
  }
}

document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener('hashchange', () => {
  render();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
render();
fetch('runtime.json')
  .then(response => response.ok ? response.json() : null)
  .then(runtime => {
    if (!runtime?.live) return;
    window.guildbaseLive.enable();
    const link = document.querySelector('#dashboard-link');
    link.href = '#/live';
    link.dataset.nav = '/live';
    link.textContent = 'Discord 控制台';
    render();
  }).catch(() => {});
