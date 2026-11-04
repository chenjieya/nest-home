import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/** 有界缓存；过期数据仅用于上游失败时的显式降级。 */
export class Cache {
  constructor(max, now = Date.now) {
    this.max = max;
    this.now = now;
    this.entries = new Map();
  }
  get(key, stale = false) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.staleUntil <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return stale || entry.expires > this.now() ? entry.value : null;
  }
  set(key, value, ttl, staleTtl = 0) {
    this.entries.delete(key);
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, {
      value,
      expires: this.now() + ttl,
      staleUntil: this.now() + ttl + staleTtl,
    });
  }
}

/** 单实例持久化配额：先落盘计数再请求；按北京时间自然月重置，损坏时拒绝启动。 */
export class Budget {
  constructor(directory, limit, now = Date.now) {
    this.limit = limit;
    this.now = now;
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, "amap-usage.json");
    this.state = { month: this.month(), count: 0 };
    try {
      const state = JSON.parse(readFileSync(this.path, "utf8"));
      if (
        !/^\d{4}-\d{2}$/.test(state.month) ||
        !Number.isSafeInteger(state.count) ||
        state.count < 0
      ) {
        throw new Error("invalid counter");
      }
      this.state = state;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Cannot read weather usage counter");
    }
  }
  month() {
    return new Date(this.now() + 8 * 3600000).toISOString().slice(0, 7);
  }
  take() {
    const month = this.month();
    if (this.state.month !== month) this.state = { month, count: 0 };
    if (this.state.count >= this.limit) return false;
    this.state.count++;
    try {
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
      renameSync(`${this.path}.tmp`, this.path);
    } catch {
      throw new Error("Cannot persist weather usage counter");
    }
    return true;
  }
}

/** 固定窗口限流，最多保留配置数量的访客；全局窗口限制总请求量。 */
export class RateLimiter {
  constructor(config, now = Date.now) {
    this.config = config;
    this.now = now;
    this.visitors = new Map();
    this.window = -1;
    this.total = 0;
  }
  allow(ip) {
    const window = Math.floor(this.now() / 60000);
    if (window !== this.window) {
      this.window = window;
      this.total = 0;
      this.visitors.clear();
    }
    if (++this.total > this.config.globalRatePerMinute) return false;
    if (!this.visitors.has(ip) && this.visitors.size >= this.config.maxEntries) return false;
    const count = (this.visitors.get(ip) || 0) + 1;
    this.visitors.set(ip, count);
    return count <= this.config.ratePerMinute;
  }
}
