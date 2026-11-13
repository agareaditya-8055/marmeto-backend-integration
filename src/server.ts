
import "reflect-metadata";
import express from "express";
import type { Server } from "http";

import { env } from "./config/env";
import { AppDataSource } from "./database/data-source";
import webhookRouter from "./modules/webhooks/webhook.routes";
import { runReconciliation } from "./workers/reconciliation.worker";
import adminReplayRouter from "./modules/courier/shipment.replay.routes";

const app = express();

app.use("/webhooks", webhookRouter);
app.use("/admin", adminReplayRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Marmeto Integration Service is running",
  });
});

let server: Server;
let reconciliationTimer: ReturnType<typeof setInterval> | undefined;
let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    // Run once immediately after startup.
    void runReconciliation();

    // Run reconciliation every 30 seconds.
    reconciliationTimer = setInterval(() => {
      if (!isShuttingDown) {
        void runReconciliation();
      }
    }, 30_000);

    server = app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  try {
    if (reconciliationTimer) {
      clearInterval(reconciliationTimer);
    }

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    console.log("Application shut down successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void bootstrap();
