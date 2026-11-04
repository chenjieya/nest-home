import { readConfig } from "./config.mjs";
import { Budget } from "./state.mjs";
import { createProviders } from "./providers.mjs";
import { createWeatherService } from "./service.mjs";
import { createWeatherServer } from "./server.mjs";

try {
  const config = readConfig();
  const budget = new Budget(config.dataDir, config.monthlyLimit);
  const service = createWeatherService(config, createProviders(config, budget));
  const server = createWeatherServer(config, service);
  server.on("error", () => {
    console.error("Weather service failed to listen");
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () =>
    console.info(`Weather service listening on port ${config.port}`),
  );
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch {
  console.error(
    "Weather service initialization failed; check configuration and data directory permissions",
  );
  process.exitCode = 1;
}
