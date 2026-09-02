import { buildApp } from "./app";

const app = buildApp();
const host = process.env.HOST ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "5556", 10);

try {
  await app.listen({ host, port });
  app.log.info(`Newfork API listening at http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
