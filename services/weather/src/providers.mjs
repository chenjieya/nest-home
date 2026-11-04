/** 供应商错误只保留分类，不把包含 Key 的 URL 或上游原文传给客户端/日志。 */
export class ProviderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const text = (value) =>
  typeof value === "string" && value.trim().length <= 100 ? value.trim() : "";
const number = (value) =>
  (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const cityName = (value) => text(value).replace(/(市|地区|自治州)$/, "");

/** 仅请求固定/管理员配置的地址；不接受调用者提供 URL，不跟随重定向。 */
export function createProviders(config, budget, fetchImpl = fetch) {
  async function json(url) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: "error",
      });
      if (!response.ok) throw new ProviderError("UPSTREAM_HTTP");
      const body = await response.text();
      if (body.length > 65536) throw new ProviderError("UPSTREAM_RESPONSE");
      return JSON.parse(body);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("UPSTREAM_UNAVAILABLE");
    }
  }
  async function amap(path, parameters) {
    if (!config.key) throw new ProviderError("AMAP_NOT_CONFIGURED");
    if (!budget.take()) throw new ProviderError("AMAP_BUDGET_EXHAUSTED");
    const url = new URL(path, "https://restapi.amap.com");
    url.search = new URLSearchParams({ ...parameters, key: config.key, output: "JSON" });
    const data = await json(url);
    if (data?.status !== "1" || data?.infocode !== "10000")
      throw new ProviderError("AMAP_REJECTED");
    return data;
  }
  return {
    async locate(ip) {
      const data = await amap("/v3/ip", { ip });
      if (typeof data.adcode !== "string" || !/^\d{6}$/.test(data.adcode))
        throw new ProviderError("LOCATION_UNAVAILABLE");
      return { adcode: data.adcode, city: text(data.city) || text(data.province) };
    },
    async weather(location) {
      const data = await amap("/v3/weather/weatherInfo", {
        city: location.adcode,
        extensions: "base",
      });
      const live = data?.lives?.[0];
      const temperature = number(live?.temperature);
      if (
        !live ||
        live.adcode !== location.adcode ||
        !text(live.city) ||
        !text(live.weather) ||
        temperature === null
      ) {
        throw new ProviderError("UPSTREAM_RESPONSE");
      }
      return {
        city: text(live.city),
        adcode: live.adcode,
        weather: text(live.weather),
        temperature,
        temperatureKind: "current",
        winddirection: text(live.winddirection),
        windpower: text(live.windpower),
        updatedAt: text(live.reporttime),
        source: "amap",
      };
    },
    async fallback(location, ip) {
      if (!config.fallbackEnabled) throw new ProviderError("FALLBACK_DISABLED");
      const url = new URL(config.fallbackUrl);
      if (ip) url.searchParams.set("ip", ip);
      const data = await json(url);
      const result = data?.result;
      if (Number(data?.code) !== 200 || !result?.city || !result?.condition)
        throw new ProviderError("UPSTREAM_RESPONSE");
      const city = text(result.city.City) || text(result.city.city_name);
      const adcode = text(result.city.adcode);
      // 旧备用接口可能忽略 ip 参数；必须核对城市，不能把服务器城市冒充访问者城市。
      const matches = adcode
        ? adcode === location.adcode
        : cityName(city) && cityName(city) === cityName(location.city);
      if (!matches) throw new ProviderError("FALLBACK_LOCATION_MISMATCH");
      const condition = result.condition;
      let temperature = number(condition.temp ?? condition.temperature);
      let temperatureKind = "current";
      if (temperature === null) {
        const low = number(condition.min_degree);
        const high = number(condition.max_degree);
        if (low !== null && high !== null && low <= high) {
          temperature = Math.round((low + high) / 2);
          temperatureKind = "range-midpoint";
        }
      }
      const weather = text(condition.day_weather) || text(condition.weather);
      if (!city || !weather || temperature === null) throw new ProviderError("UPSTREAM_RESPONSE");
      return {
        city,
        adcode: location.adcode,
        weather,
        temperature,
        temperatureKind,
        winddirection: text(condition.day_wind_direction) || text(condition.windDirection),
        windpower: text(condition.day_wind_power) || text(condition.windLevel),
        updatedAt: text(condition.update_time),
        source: "oioweb",
      };
    },
  };
}
