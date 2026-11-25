import pg from 'pg';
import { createClient } from 'redis';

export const defaults = {
  text: true, voice: true, textRate: 15, voiceRate: 5, cooldown: 60,
  ignore: [], ignoreRoles: [], rewardLevel: 10, role: '', replaceRoles: [], public: false,
  welcome: false, welcomeChannel: '', welcomeMessage: '欢迎 {user} 加入 {server}！',
  welcomeRole: '', selfRoles: [], roleChannel: '', roleStyle: 'buttons',
  roleMessage: '', blockedTerms: '', blockInvites: false, floodCount: 0,
  timeoutSeconds: 60, logChannel: '', dailyXP: 25,
  prefix: '!', prefixEnabled: true
};

export const schema = `
CREATE TABLE IF NOT EXISTS guild_settings (guild_id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_sessions (id text PRIMARY KEY, access_token text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  guild_id text NOT NULL, user_id text NOT NULL, name text NOT NULL, xp bigint NOT NULL,
  last_daily date, streak integer NOT NULL DEFAULT 0, PRIMARY KEY (guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS members_rank_idx ON members (guild_id,xp DESC);
CREATE TABLE IF NOT EXISTS activity (
  guild_id text NOT NULL, user_id text NOT NULL, day date NOT NULL, xp bigint NOT NULL,
  PRIMARY KEY (guild_id,user_id,day)
);
CREATE INDEX IF NOT EXISTS activity_rank_idx ON activity (guild_id,day);
CREATE TABLE IF NOT EXISTS guild_commands (guild_id text NOT NULL, name text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (guild_id,name));
CREATE TABLE IF NOT EXISTS guild_logs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, guild_id text NOT NULL, kind text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS guild_logs_idx ON guild_logs (guild_id,id DESC);
`;
const today = "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date";

export function level(xp) {
  return Math.floor(Math.sqrt(Number(xp) / 100));
}

export async function openStore({ databaseURL, redisURL }) {
  const db = new pg.Pool({ connectionString: databaseURL });
  const redis = createClient({ url: redisURL, disableOfflineQueue: true, socket: { connectTimeout: 8000 } });
  db.on('error', () => console.error('PostgreSQL connection interrupted'));
  redis.on('error', () => console.error('Redis connection interrupted'));
  try {
    await db.query(schema);
    await redis.connect();
  } catch (error) {
    await db.end();
    if (redis.isOpen) redis.destroy();
    throw error;
  }
  return new Store(db, redis);
}

export class Store {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
  }

  async settings(guild, useCache = false) {
    const cacheKey = 'guildbase:config:' + guild;
    if (useCache && this.redis.isReady) {
      try {
        const value = await this.redis.get(cacheKey);
        if (value) return { ...defaults, ...JSON.parse(value) };
      } catch {
        // PostgreSQL remains available when Redis is reconnecting.
      }
    }
    const { rows } = await this.db.query('SELECT value FROM guild_settings WHERE guild_id=$1', [guild]);
    if (useCache && this.redis.isReady) {
      await this.redis.set(cacheKey, JSON.stringify(rows[0]?.value || {}), { EX: 5, NX: true }).catch(() => {});
    }
    return { ...defaults, ...rows[0]?.value };
  }

  async save(guild, patch) {
    await this.db.query(`INSERT INTO guild_settings VALUES ($1,$2::jsonb)
      ON CONFLICT (guild_id) DO UPDATE SET value=guild_settings.value || EXCLUDED.value`, [guild, patch]);
    if (this.redis.isReady) await this.redis.del('guildbase:config:' + guild).catch(() => {});
  }

  async cooldown(guild, user, seconds) {
    if (!this.redis.isReady) return false;
    return Boolean(await this.redis.set('guildbase:xp:' + guild + ':' + user, '1', { EX: seconds, NX: true }));
  }

  async replyCooldown(guild, user, seconds = 3) {
    if (!this.redis.isReady) return null;
    return Boolean(await this.redis.set('guildbase:reply:' + guild + ':' + user, '1', { EX: seconds, NX: true }));
  }

  async flood(guild, user, limit) {
    if (!this.redis.isReady) return false;
    const key = 'guildbase:flood:' + guild + ':' + user;
    const count = await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],10) end; return n", { keys: [key] });
    return count === limit;
  }

  async award(guild, user, name, amount) {
    const { rows } = await this.db.query(`WITH changed AS (
      INSERT INTO members (guild_id,user_id,name,xp) VALUES ($1,$2,$3,$4)
      ON CONFLICT (guild_id,user_id) DO UPDATE SET xp=members.xp+EXCLUDED.xp,name=EXCLUDED.name RETURNING xp
    ), recorded AS (
      INSERT INTO activity VALUES ($1,$2,${today},$4)
      ON CONFLICT (guild_id,user_id,day) DO UPDATE SET xp=activity.xp+EXCLUDED.xp
    ) SELECT xp FROM changed`, [guild, user, name, amount]);
    return Number(rows[0].xp);
  }

  async daily(guild, user, name, baseXP) {
    const { rows } = await this.db.query(`WITH changed AS (
      INSERT INTO members (guild_id,user_id,name,xp,last_daily,streak) VALUES ($1,$2,$3,$4::bigint,${today},1)
      ON CONFLICT (guild_id,user_id) DO UPDATE SET
        xp=members.xp + $4::bigint * CASE WHEN members.last_daily=${today}-1 THEN least(members.streak+1,7) ELSE 1 END,
        streak=CASE WHEN members.last_daily=${today}-1 THEN members.streak+1 ELSE 1 END,
        last_daily=${today},name=EXCLUDED.name
      WHERE members.last_daily IS NULL OR members.last_daily<${today} RETURNING xp,streak
    ), recorded AS (
      INSERT INTO activity SELECT $1,$2,${today},$4::bigint*least(streak,7) FROM changed
      ON CONFLICT (guild_id,user_id,day) DO UPDATE SET xp=activity.xp+EXCLUDED.xp
    ) SELECT xp,streak FROM changed`, [guild, user, name, baseXP]);
    return rows[0] || null;
  }

  async rank(guild, user) {
    const { rows } = await this.db.query('SELECT xp FROM members WHERE guild_id=$1 AND user_id=$2', [guild, user]);
    return Number(rows[0]?.xp || 0);
  }

  async ranking(guild, days, search = '', limit = 100) {
    const period = days ? `SELECT user_id,sum(xp) AS score FROM activity WHERE guild_id=$1 AND day>=${today}-($2::int-1) GROUP BY user_id` : 'SELECT user_id,xp AS score FROM members WHERE guild_id=$1 AND $2::int=0';
    const { rows } = await this.db.query(`WITH scores AS (${period}), ranked AS (
      SELECT row_number() OVER (ORDER BY score DESC,s.user_id) AS pos,name,xp,score
      FROM scores s JOIN members m ON m.guild_id=$1 AND m.user_id=s.user_id
    ) SELECT * FROM ranked WHERE strpos(lower(name),lower($3))>0 ORDER BY pos LIMIT $4`, [guild, days, search, limit]);
    return rows.map(({ pos, name, xp, score }) => ({ pos: Number(pos), name, level: level(xp), score: Number(score) }));
  }

  async commands(guild) {
    const { rows } = await this.db.query('SELECT name,value FROM guild_commands WHERE guild_id=$1 ORDER BY name', [guild]);
    return rows.map(({ name, value }) => ({ ...value, name }));
  }

  async command(guild, name) {
    const { rows } = await this.db.query('SELECT value FROM guild_commands WHERE guild_id=$1 AND name=$2', [guild, name]);
    return rows[0]?.value;
  }

  async saveCommand(guild, name, value) {
    await this.db.query('INSERT INTO guild_commands VALUES ($1,$2,$3) ON CONFLICT (guild_id,name) DO UPDATE SET value=EXCLUDED.value', [guild, name, value]);
  }

  async removeCommand(guild, name) {
    await this.db.query('DELETE FROM guild_commands WHERE guild_id=$1 AND name=$2', [guild, name]);
  }

  async log(guild, kind, message) {
    await this.db.query('INSERT INTO guild_logs (guild_id,kind,message) VALUES ($1,$2,$3)', [guild, kind, message.slice(0, 512)]);
  }

  async logs(guild) {
    const { rows } = await this.db.query('SELECT kind,message,created_at FROM guild_logs WHERE guild_id=$1 ORDER BY id DESC LIMIT 100', [guild]);
    return rows;
  }

  async session(id) {
    if (!id) return null;
    const { rows } = await this.db.query('SELECT access_token FROM oauth_sessions WHERE id=$1 AND expires_at>now()', [id]);
    return rows[0]?.access_token;
  }

  async createSession(id, token, life) {
    await this.db.query('DELETE FROM oauth_sessions WHERE expires_at<=now()');
    await this.db.query("INSERT INTO oauth_sessions VALUES ($1,$2,now()+$3 * interval '1 second')", [id, token, life]);
  }

  async endSession(id) {
    if (id) await this.db.query('DELETE FROM oauth_sessions WHERE id=$1', [id]);
  }
}
