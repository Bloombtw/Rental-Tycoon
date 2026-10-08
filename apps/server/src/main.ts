import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const app = buildApp();
app.listen({ port, host: "127.0.0.1" }).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
