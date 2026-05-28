import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./lib/types";
import healthRouter from "./routes/health";
import debugRouter from "./routes/debug";
import publicSupplierRouter from "./routes/publicSupplier";
import procurementRouter from "./routes/procurement";
import adminUsersRouter from "./routes/adminUsers";

export type { Env, Variables };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const raw = c.env.ALLOWED_ORIGINS ?? "";
  const allowed = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (allowed.length === 0) return origin;
      return allowed.includes(origin) ? origin : (allowed[0] ?? "");
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })(c, next);
});

app.route("/api/healthz", healthRouter);
app.route("/api/debug", debugRouter);
app.route("/api/public", publicSupplierRouter);
app.route("/api/procurement", procurementRouter);
app.route("/api/admin/users", adminUsersRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("Unhandled Worker error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
