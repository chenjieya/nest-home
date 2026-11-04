import { createServer } from "node:http";
import { normalizeIp } from "./service.mjs";
import { RateLimiter } from "./state.mjs";

/** TRUST_PROXY 仅用于受控反代后的服务；只接受被 Nginx 覆盖的 X-Real-IP。 */
export function createWeatherServer(config, service) {
  const limiter = new RateLimiter(config);
  const send = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://weather.local");
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return send(res, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "只支持 GET 请求" },
        });
      }
      if (["/healthz", "/api/weather/health"].includes(url.pathname))
        return send(res, 200, { status: "ok" });
      if (url.pathname !== "/api/weather")
        return send(res, 404, { error: { code: "NOT_FOUND", message: "接口不存在" } });
      // 不信任浏览器提交的 X-Forwarded-For，也不提供任意 IP/URL 转发功能。
      const ip = normalizeIp(
        config.trustProxy ? req.headers["x-real-ip"] : req.socket.remoteAddress,
      );
      const rateKey = ip || normalizeIp(req.socket.remoteAddress);
      if (!limiter.allow(rateKey)) {
        res.setHeader("Retry-After", "60");
        return send(res, 429, {
          error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
        });
      }
      const city = url.searchParams.get("city");
      if (
        [...url.searchParams.keys()].some((key) => key !== "city") ||
        url.searchParams.getAll("city").length > 1 ||
        (city !== null && !/^\d{6}$/.test(city))
      ) {
        return send(res, 400, {
          error: { code: "INVALID_REQUEST", message: "city 必须是六位行政区划编码" },
        });
      }
      const data = await service.get({ ip, city });
      return send(res, 200, data);
    } catch {
      // 不输出异常原文，避免上游 URL、Key、IP 或响应体泄漏。
      return send(res, 503, {
        error: { code: "WEATHER_UNAVAILABLE", message: "天气暂时不可用，请稍后再试" },
      });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
