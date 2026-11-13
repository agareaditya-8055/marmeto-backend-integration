
import { Worker } from "bullmq";
import { processShipment } from "../modules/courier/shipment.processor";
import {
  SHIPMENT_QUEUE,
  ShipmentJobData,
} from "../queues/shipment.queue";
import { createRedisConnection } from "../config/redis";
import { CourierRequestError } from "../modules/courier/courier.client";

export const shipmentWorker = new Worker<ShipmentJobData>(
  SHIPMENT_QUEUE,
  async (job) => {
    console.log("Processing shipment job:", job.id);

    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    await processShipment(
      job.data,
      attemptNumber,
      maxAttempts,
    );
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,

    settings: {
      backoffStrategy: (attemptsMade, type, error) => {
        if (type !== "courier") {
          return -1;
        }

        if (error instanceof CourierRequestError) {
          return error.retryDelayMs;
        }

        return Math.min(
          2000 * Math.pow(2, attemptsMade - 1),
          30000,
        );
      },
    },
  },
);

shipmentWorker.on("completed", (job) => {
  console.log(`Shipment job ${job.id} completed`);
});

shipmentWorker.on("failed", (job, error) => {
  console.error(
    `Shipment job ${job?.id} failed:`,
    error.message,
  );
});

shipmentWorker.on("error", (error) => {
  console.error("Shipment worker error:", error);
});
