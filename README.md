# GuildBase

Discord 社区管理网站和 Bot。保留了可以独立使用的浏览器演示，并提供 Railway 正式模式。

## 本地预览

使用 Node.js 22 或更新版本，依次运行 `npm ci` 和 `npm start`，打开 `http://localhost:3000`。未设置正式模式的环境变量时，主页和演示控制台可直接访问。演示的数据保存在各自浏览器内。首页的「查看完整控制台演示」可以预览完整设置，包括 Embed 和身份组面板。

静态托管可以发布 `dist/`。Discord 登录和真实服务器管理需要运行本项目的 Node.js 服务。

## Railway 正式模式

1. 把源码提交到 GitHub，使用该仓库创建 Railway 服务。仓库里的 `Dockerfile` 安装 Bot 和等级卡需要的依赖，包括中文字体。网页与 Bot 由同一服务运行，请使用一个副本。
2. 在该项目添加 PostgreSQL 和 Redis，分别把连接地址引用到应用服务的 `DATABASE_URL` 和 `REDIS_URL`。程序启动时自动创建表。生成应用的 HTTPS 域名，填入 `APP_URL`，仅填写域名和协议。
3. 在 [Discord Developer Portal](https://discord.com/developers/applications) 创建或选择一个专用应用，启用 Guild Install。在 **OAuth2** 的 Redirects 添加 `APP_URL/auth/discord/callback`，把 `APP_URL` 替换为实际 HTTPS 地址。
4. 在 Discord 应用的 **Bot** 页开启 **Server Members Intent** 与 **Message Content Intent**。将 Application ID、OAuth2 Client Secret 和 Bot Token 分别保存到 Railway 的 `DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET` 和 `DISCORD_BOT_TOKEN`。为已有运行实例的 Bot 切换服务前，先协调停掉旧实例，以避免两个进程对同一活动重复处理。
5. 部署成功后，在网站点击 **Discord 控制台** → **使用 Discord 登录** → **邀请 Bot**。授权后返回服务器列表刷新，再进入配置。需要自动发放的身份组请摆在 Bot 身份组下方。每台服务器的网页榜单默认关闭，开启后，可分享概览里的排行榜链接。

## 功能与默认行为

- Discord 登录按服务器权限显示可管理服务器；每次后台请求重新检查权限。
- 发言有可配置的冷却（默认 60 秒）。语音按有效分钟计分，排除 AFK、忽略频道和身份组、自我耳聋及全员静音。语音计时在进程重启后重新开始，运行期间每 30 秒检查一次。
- `/daily` 按马来西亚时间换日，连签奖励倍率最多 7 倍；`/rank` 输出 PNG；`/leaderboard` 显示前 10 名。网页榜单提供累计、7 日和 30 日 XP。
- 支持新成员欢迎 PNG 和默认身份组、自助角色按钮或下拉菜单、自定义指令触发词及斜杠指令、纯文字及 Embed、身份组限制。
- 自动管理支持屏蔽词、邀请链接和 10 秒刷屏阈值，可设置禁言时间；有管理消息权限的成员不受该规则影响。
- 控制台支持查看最近 100 条日志，可为消息编辑、删除及成员进出配置 Discord 日志频道。消息事件只记录频道与消息 ID，不留存消息全文。
