import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { ensureStorageDir } from "./services/storage.service";
import { startCleanupScheduler } from "./services/cleanup.service";
import { errorHandler } from "./middleware/error.middleware";
import { authRouter } from "./routes/auth.routes";
import { vaultRouter } from "./routes/vault.routes";
import { shareRouter } from "./routes/share.routes";
import { blobRouter } from "./routes/blob.routes";
import { logsRouter } from "./routes/logs.routes";
import { webCompatRouter } from "./routes/webCompat.routes";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ["X-VaultX-File-IV", "X-VaultX-SHA256", "X-VaultX-Wrapped-Key"],
  })
);
app.use(express.json({ limit: "50mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const blobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vaultx-backend" });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api", webCompatRouter);
app.use("/api", vaultRouter);
app.use("/api/share", shareRouter);
app.use("/api/blob", blobLimiter, blobRouter);
app.use("/api", logsRouter);

app.use(errorHandler);

async function bootstrap() {
  await ensureStorageDir();
  startCleanupScheduler();

  app.listen(env.PORT, () => {
    console.log(`VaultX backend listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start VaultX backend:", err);
  process.exit(1);
});
