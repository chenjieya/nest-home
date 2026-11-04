import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { readConfig } from "../src/config.mjs";
import { Budget, RateLimiter } from "../src/state.mjs";
import { createProviders, ProviderError } from "../src/providers.mjs";
import { createWeatherService } from "../src/service.mjs";
import { createWeatherServer } from "../src/server.mjs";

const config = (extra = {}) => ({ ...readConfig({ AMAP_KEY: "test-secret" }), ...extra });
const location = { adcode: "110000", city: "北京市" };
const weather = {
  ...location,
  weather: "晴",
  temperature: 0,
  temperatureKind: "current",
  winddirection: "北",
  windpower: "3",
  updatedAt: "",
  source: "amap",
};
const upstream = (data) => new Response(JSON.stringify(data));
const amapData = (temperature = "0") => ({
  status: "1",
  infocode: "10000",
  lives: [{ ...weather, temperature }],
});
const fail = () => {
  throw new ProviderError("UPSTREAM_UNAVAILABLE");
};

function directory(t) {
  const path = mkdtempSync(join(tmpdir(), "nest-weather-test-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

async function listen(t, options, service) {
  const server = createWeatherServer(options, service);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("高德显式传访客 IP，使用服务端 Key，保留零度且不返回 Key", async () => {
  const requests = [];
  let count = 0;
  const providers = createProviders(
    config(),
    {
      take: () => {
        count++;
        return true;
      },
    },
    async (url, options) => {
      requests.push(url);
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return upstream(
        url.pathname === "/v3/ip" ? { status: "1", infocode: "10000", ...location } : amapData(),
      );
    },
  );
  const service = createWeatherService(config(), providers);
  const response = await service.get({ ip: "8.8.8.8" });
  assert.equal(requests[0].searchParams.get("ip"), "8.8.8.8");
  assert.equal(requests[1].searchParams.get("city"), location.adcode);
  assert.ok(requests.every((url) => url.searchParams.get("key") === "test-secret"));
  assert.equal(response.data.temperature, 0);
  assert.equal(JSON.stringify(response).includes("test-secret"), false);
  assert.equal(count, 2);
});

test("缺失、空白、布尔温度不能被误转成零度，负温度有效", async () => {
  for (const temperature of ["", " ", null, false, [], {}]) {
    const provider = createProviders(config(), { take: () => true }, async () =>
      upstream(amapData(temperature)),
    );
    await assert.rejects(provider.weather(location), { code: "UPSTREAM_RESPONSE" });
  }
  const provider = createProviders(config(), { take: () => true }, async () =>
    upstream(amapData("-5")),
  );
  assert.equal((await provider.weather(location)).temperature, -5);
});

test("合并同一访客并发请求，不同访客复用城市缓存且不延长旧数据寿命", async () => {
  let time = 1000;
  let geoCount = 0;
  let weatherCount = 0;
  const service = createWeatherService(
    config({ cacheMs: 1000 }),
    {
      locate: async () => {
        geoCount++;
        return location;
      },
      weather: async () => {
        weatherCount++;
        return weather;
      },
      fallback: fail,
    },
    () => time,
  );
  await Promise.all(Array.from({ length: 10 }, () => service.get({ ip: "8.8.8.8" })));
  assert.equal(geoCount, 1);
  assert.equal(weatherCount, 1);
  time = 1900;
  assert.equal((await service.get({ ip: "1.1.1.1" })).cached, true);
  assert.equal(geoCount, 2);
  assert.equal(weatherCount, 1);
  time = 2100;
  assert.equal((await service.get({ ip: "1.1.1.1" })).cached, false);
  assert.equal(weatherCount, 2);
});

test("高德失败切备用，校验城市，最高最低温度只标为估算", async () => {
  let fallbackUrl;
  const providers = createProviders(config(), { take: () => true }, async (url) => {
    if (url.hostname === "restapi.amap.com") {
      if (url.pathname === "/v3/ip")
        return upstream({ status: "1", infocode: "10000", ...location });
      throw new Error("network failure with secret URL");
    }
    fallbackUrl = url;
    return upstream({
      code: 200,
      result: {
        city: { City: "北京" },
        condition: {
          day_weather: "多云",
          min_degree: "10",
          max_degree: "20",
          day_wind_direction: "北风",
          day_wind_power: "3级",
        },
      },
    });
  });
  const response = await createWeatherService(config(), providers).get({ ip: "8.8.8.8" });
  assert.equal(response.data.source, "oioweb");
  assert.equal(response.data.temperature, 15);
  assert.equal(response.data.temperatureKind, "range-midpoint");
  assert.equal(fallbackUrl.searchParams.has("key"), false);
  assert.equal(fallbackUrl.searchParams.get("ip"), "8.8.8.8");
  await assert.rejects(providers.fallback({ adcode: "310000", city: "上海市" }, "8.8.8.8"), {
    code: "FALLBACK_LOCATION_MISMATCH",
  });
});

test("上游异常用限期旧缓存，持续访问不会延长供应商冷却，恢复后重试高德", async () => {
  let time = 1000;
  let broken = false;
  let attempts = 0;
  const service = createWeatherService(
    config({ cacheMs: 1000, staleMs: 120000 }),
    {
      weather: async () => {
        attempts++;
        if (broken) fail();
        return weather;
      },
      fallback: fail,
    },
    () => time,
  );
  const args = { city: location.adcode };
  await service.get(args);
  broken = true;
  time = 3000;
  assert.equal((await service.get(args)).stale, true);
  time = 40000;
  assert.equal((await service.get(args)).stale, true);
  assert.equal(attempts, 2);
  time = 64000;
  broken = false;
  assert.equal((await service.get(args)).stale, false);
  assert.equal(attempts, 3);
  time = 186000;
  broken = true;
  await assert.rejects(service.get(args));
});

test("定位失败、IPv6、私网地址不会使用服务器所在地冒充访客", async () => {
  let attempts = 0;
  const service = createWeatherService(config(), {
    locate: () => {
      attempts++;
      throw new ProviderError("LOCATION_UNAVAILABLE");
    },
    weather: () => {
      assert.fail("不应查询天气");
    },
    fallback: () => {
      assert.fail("无可信城市不应调用备用");
    },
  });
  for (const ip of ["::1", "2001:4860:4860::8888", "127.0.0.1", "192.168.1.1", "10.0.0.1", ""]) {
    await assert.rejects(service.get({ ip }), { code: "LOCATION_UNAVAILABLE" });
  }
  assert.equal(attempts, 0);
  await assert.rejects(service.get({ ip: "8.8.8.8" }), { code: "LOCATION_UNAVAILABLE" });
  assert.equal(attempts, 1);
});

test("调用上限跨重启保持，按北京时间自然月恢复，损坏计数拒绝启动", (t) => {
  const path = directory(t);
  let time = Date.parse("2026-11-30T15:59:59Z");
  const budget = new Budget(path, 2, () => time);
  assert.equal(budget.take(), true);
  assert.equal(budget.take(), true);
  assert.equal(new Budget(path, 2, () => time).take(), false);
  time += 1000;
  assert.equal(budget.take(), true);
  assert.equal(budget.state.month, "2026-12");
  assert.equal(budget.state.count, 1);
  writeFileSync(join(path, "amap-usage.json"), "broken counter");
  assert.throws(() => new Budget(path, 2), /Cannot read weather usage counter/);
});

test("失败请求也计数；额度耗尽或无 Key 时不会向高德发送请求", async (t) => {
  let requests = 0;
  const budget = new Budget(directory(t), 1);
  const provider = createProviders(config(), budget, async () => {
    requests++;
    throw new Error("secret");
  });
  await assert.rejects(provider.locate("8.8.8.8"), { code: "UPSTREAM_UNAVAILABLE" });
  await assert.rejects(provider.locate("8.8.8.8"), { code: "AMAP_BUDGET_EXHAUSTED" });
  const noKey = createProviders(config({ key: "" }), budget, () => {
    assert.fail("不应请求");
  });
  await assert.rejects(noKey.weather(location), { code: "AMAP_NOT_CONFIGURED" });
  assert.equal(requests, 1);
});

test("上游超时通过 AbortSignal 终止，异常不带 URL/Key", async () => {
  const provider = createProviders(
    config({ timeoutMs: 100 }),
    { take: () => true },
    async (_url, { signal }) => {
      // 普通定时器保持测试事件循环运行；真实 fetch 自身持有网络连接。
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("did not abort")), 1000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("url?key=test-secret"));
          },
          { once: true },
        );
      });
    },
  );
  await assert.rejects(provider.weather(location), { message: "UPSTREAM_UNAVAILABLE" });
});

test("HTTP 仅信任明确启用的 X-Real-IP，不采信 X-Forwarded-For", async (t) => {
  const seen = [];
  const service = {
    get: async (args) => {
      seen.push(args);
      return { data: weather };
    },
  };
  const direct = await listen(t, config(), service);
  const proxy = await listen(t, config({ trustProxy: true }), service);
  const headers = { "X-Real-IP": "8.8.8.8", "X-Forwarded-For": "1.1.1.1" };
  await fetch(`${direct}/api/weather`, { headers });
  await fetch(`${proxy}/api/weather`, { headers });
  await fetch(`${proxy}/api/weather`, { headers: { "X-Forwarded-For": "1.1.1.1" } });
  assert.equal(seen[0].ip, "127.0.0.1");
  assert.equal(seen[1].ip, "8.8.8.8");
  assert.equal(seen[2].ip, "");
});

test("HTTP 参数和限流校验、健康检查免调用，错误不泄漏敏感数据", async (t) => {
  let calls = 0;
  const base = await listen(t, config({ ratePerMinute: 8 }), {
    get: async () => {
      calls++;
      throw new Error("key=test-secret");
    },
  });
  for (const route of ["/healthz", "/api/weather/health"]) {
    assert.equal((await fetch(`${base}${route}`)).status, 200);
  }
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/weather`, { method: "POST" })).status, 405);
  for (const query of [
    "ip=8.8.8.8",
    "url=https://example.com",
    "city=1",
    "city=110000&city=310000",
  ]) {
    assert.equal((await fetch(`${base}/api/weather?${query}`)).status, 400);
  }
  assert.equal(calls, 0);
  const failed = await fetch(`${base}/api/weather?city=110000`);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("Cache-Control"), "no-store");
  assert.equal((await failed.text()).includes("test-secret"), false);
  for (let i = 0; i < 3; i++) await fetch(`${base}/api/weather`);
  const limited = await fetch(`${base}/api/weather`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test("分钟限流重置并约束全局流量；危险或错误配置拒绝启动", () => {
  let time = 0;
  const limiter = new RateLimiter(config({ ratePerMinute: 1, globalRatePerMinute: 2 }), () => time);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
  assert.equal(limiter.allow("b"), false);
  time = 60000;
  assert.equal(limiter.allow("a"), true);
  assert.throws(() => readConfig({ FALLBACK_WEATHER_URL: "http://example.com" }));
  assert.throws(() => readConfig({ AMAP_MONTHLY_LIMIT: "-1" }));
  assert.throws(() => readConfig({ TRUST_PROXY: "yes" }));
});
