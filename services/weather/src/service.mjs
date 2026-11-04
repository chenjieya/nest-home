import { isIP } from "node:net";
import { Cache } from "./state.mjs";
import { ProviderError } from "./providers.mjs";

export function normalizeIp(value) {
  if (typeof value !== "string") return "";
  const ip = value.startsWith("::ffff:") ? value.slice(7) : value;
  return isIP(ip) ? ip : "";
}

function publicIpv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** 聚合供应商，合并相同请求，复用城市缓存；服务实例之间不共享内存状态。 */
export function createWeatherService(config, providers, now = Date.now) {
  const locations = new Cache(config.maxEntries, now);
  const weather = new Cache(config.maxEntries, now);
  const inflight = new Map();
  let amapRetryAt = 0;
  let fallbackRetryAt = 0;
  async function once(key, work) {
    if (inflight.has(key)) return inflight.get(key);
    if (inflight.size >= 64) throw new ProviderError("SERVICE_BUSY");
    const task = Promise.resolve()
      .then(work)
      .finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  }
  const result = (data, cached, stale = false) => ({ data, cached, stale });
  return {
    async get({ ip, city }) {
      const key = city ? `city:${city}` : `ip:${ip}`;
      return once(key, async () => {
        let location = city ? { adcode: city, city: "" } : locations.get(ip);
        try {
          if (!location) {
            if (!publicIpv4(ip)) throw new ProviderError("LOCATION_UNAVAILABLE");
            if (amapRetryAt > now()) throw new ProviderError("AMAP_COOLDOWN");
            try {
              location = await providers.locate(ip);
              locations.set(ip, location, 86400000);
            } catch (error) {
              // 单个无法定位的地址不影响其他访客；鉴权、额度或网络失败才进入冷却。
              if (error.code !== "LOCATION_UNAVAILABLE") amapRetryAt = now() + 60000;
              throw error;
            }
          }
          const cityHit = weather.get(location.adcode);
          if (cityHit) {
            return result(cityHit, true);
          }
          const data = await once(`provider:${location.adcode}`, async () => {
            try {
              if (amapRetryAt > now()) throw new ProviderError("AMAP_COOLDOWN");
              return await providers.weather(location);
            } catch (primaryError) {
              // 冷却期内的请求不顺延截止时间，确保供应商有机会恢复。
              if (primaryError.code !== "AMAP_COOLDOWN") amapRetryAt = now() + 60000;
              try {
                if (fallbackRetryAt > now()) throw new ProviderError("FALLBACK_COOLDOWN");
                return await providers.fallback(location, publicIpv4(ip) ? ip : "");
              } catch (error) {
                if (!["FALLBACK_LOCATION_MISMATCH", "FALLBACK_COOLDOWN"].includes(error.code))
                  fallbackRetryAt = now() + 60000;
                throw error;
              }
            }
          });
          weather.set(location.adcode, data, config.cacheMs, config.staleMs);
          return result(data, false);
        } catch (error) {
          const stale = location && weather.get(location.adcode, true);
          if (stale) return result(stale, true, true);
          throw error;
        }
      });
    },
  };
}
