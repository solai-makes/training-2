import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const port = Number(process.env.PRIVATE_API_PORT ?? "3001");
serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () =>
  console.log("private-api listening on port", port),
);
