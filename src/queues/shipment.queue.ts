
import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis";

export const SHIPMENT_QUEUE = "shipment-processing";

export interface ShipmentJobData {
  shipmentId: number;
  orderId: string;
}

export const shipmentQueue = new Queue<ShipmentJobData>(
  SHIPMENT_QUEUE,
  {
    connection: createRedisConnection(),

    defaultJobOptions: {
      attempts: 5,

      backoff: {
        type: "courier",
        delay: 2000,
      },

      removeOnComplete: true,
      removeOnFail: false,
    },
  },
);
