import { buildApp } from "./app";

const app = buildApp();
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

try {
  await app.listen({ host: "127.0.0.1", port });
  app.log.info(`Newfork API listening on ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
