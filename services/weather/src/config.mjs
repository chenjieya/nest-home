import { readFileSync } from "node:fs";

/** 仅在启动时读取服务端配置，错误信息不包含配置值。 */
export function readConfig(env = process.env) {
  const integer = (name, fallback, min, max) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Invalid configuration: ${name}`);
    }
    return value;
  };
  const boolean = (name, fallback) => {
    const value = env[name] ?? String(fallback);
    if (!["true", "false"].includes(value)) throw new Error(`Invalid configuration: ${name}`);
    return value === "true";
  };
  const fallbackUrl = new URL(
    env.FALLBACK_WEATHER_URL || "https://api.oioweb.cn/api/weather/GetWeather",
  );
  if (fallbackUrl.protocol !== "https:" || fallbackUrl.username || fallbackUrl.password) {
    throw new Error("Invalid configuration: FALLBACK_WEATHER_URL");
  }
  return {
    port: integer("PORT", 3001, 1, 65535),
    host: env.HOST || "0.0.0.0",
    key: (env.AMAP_KEY_FILE ? readFileSync(env.AMAP_KEY_FILE, "utf8") : env.AMAP_KEY || "").trim(),
    trustProxy: boolean("TRUST_PROXY", false),
    fallbackEnabled: boolean("FALLBACK_ENABLED", true),
    fallbackUrl: fallbackUrl.toString(),
    timeoutMs: integer("UPSTREAM_TIMEOUT_MS", 4000, 100, 15000),
    cacheMs: integer("CACHE_TTL_SECONDS", 600, 1, 3600) * 1000,
    staleMs: integer("STALE_TTL_SECONDS", 3600, 0, 86400) * 1000,
    maxEntries: integer("CACHE_MAX_ENTRIES", 1000, 10, 10000),
    monthlyLimit: integer("AMAP_MONTHLY_LIMIT", 4000, 0, 10000000),
    dataDir: env.DATA_DIR || "./data",
    ratePerMinute: integer("RATE_LIMIT_PER_MINUTE", 20, 1, 1000),
    globalRatePerMinute: integer("GLOBAL_RATE_LIMIT_PER_MINUTE", 120, 1, 10000),
  };
}
