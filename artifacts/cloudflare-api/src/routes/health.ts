import { Hono } from "hono";
import type { Env } from "../index";

const router = new Hono<{ Bindings: Env }>();

router.get("/", (c) =>
  c.json({
    status: "ok",
    runtime: "cloudflare-worker",
    timestamp: new Date().toISOString(),
  }),
);

export default router;
