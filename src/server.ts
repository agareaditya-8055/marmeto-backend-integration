
import "reflect-metadata";
import express from "express";

import { env } from "./config/env";
import { AppDataSource } from "./database/data-source";

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Marmeto Integration Service is running",
  });
});

async function bootstrap(): Promise<void> {
  try {
    await AppDataSource.initialize();

    console.log("Database connected successfully");

    app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
}

bootstrap();
