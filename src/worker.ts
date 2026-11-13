
import "reflect-metadata";
import { AppDataSource } from "./database/data-source";

async function bootstrap(): Promise<void> {
  try {
    // Establish the database connection before consuming jobs.
    await AppDataSource.initialize();

    console.log("Worker database connected successfully");

    const { shipmentWorker } = await import(
      "./workers/shipment.worker.js"
    );

    console.log("Shipment worker started");

    let shuttingDown = false;

    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;

      shuttingDown = true;
      console.log(`${signal} received. Shutting down worker...`);

      try {
        // Wait for active jobs to finish.
        await shipmentWorker.close();
        console.log("Shipment worker closed successfully");
      } catch (error) {
        console.error("Error closing shipment worker:", error);
        process.exitCode = 1;
      } finally {
        // Always attempt to close the database connection.
        if (AppDataSource.isInitialized) {
          try {
            await AppDataSource.destroy();
            console.log("Worker database connection closed");
          } catch (error) {
            console.error("Error closing database connection:", error);
            process.exitCode = 1;
          }
        }
      }
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("Worker startup failed:", error);

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exitCode = 1;
  }
}

void bootstrap();
