
import {
  LessThanOrEqual,
  IsNull,
  Or,
} from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { Shipment, ShipmentStatus } from "../../entities/shipment.entity";
import { shipmentQueue } from "../../queues/shipment.queue";

const RECONCILIATION_LOCK_NAMESPACE = 12345;

export async function reconcileShipments(): Promise<number> {
  const shipmentRepository = AppDataSource.getRepository(Shipment);

  const shipments = await shipmentRepository.find({
    where: [
      { status: ShipmentStatus.PENDING },
      {
        status: ShipmentStatus.RETRY_WAIT,
        nextRetryAt: Or(IsNull(), LessThanOrEqual(new Date())),
      },
    ],
    relations: { order: true },
    take: 100,
    order: { createdAt: "ASC" },
  });

  let enqueuedCount = 0;

  for (const shipment of shipments) {
    const wasEnqueued = await AppDataSource.transaction(
      async (manager) => {
        // Serialize reconciliation for this shipment.
        await manager.query(
          "SELECT pg_advisory_xact_lock($1, $2)",
          [RECONCILIATION_LOCK_NAMESPACE, shipment.id],
        );

        // Recheck database state after acquiring the lock.
        const currentShipment = await manager.findOne(Shipment, {
          where: { id: shipment.id },
          relations: { order: true },
        });

        if (!currentShipment) return false;

        const isEligible =
          currentShipment.status === ShipmentStatus.PENDING ||
          (currentShipment.status === ShipmentStatus.RETRY_WAIT &&
            (!currentShipment.nextRetryAt ||
              currentShipment.nextRetryAt <= new Date()));

        if (!isEligible) return false;

        const jobId = `shipment-${currentShipment.id}`;
        const existingJob = await shipmentQueue.getJob(jobId);

        if (existingJob) {
          const state = await existingJob.getState();

          if (state !== "failed") return false;

          await existingJob.remove();

          console.log(`Removed failed job ${jobId}`);
        }

        const job = await shipmentQueue.add(
          "process-shipment",
          {
            shipmentId: currentShipment.id,
            orderId: currentShipment.order.orderId,
          },
          { jobId },
        );

        console.log(`Enqueued shipment ${currentShipment.id}`);

        return Boolean(job);
      },
    );

    if (wasEnqueued) enqueuedCount++;
  }

  return enqueuedCount;
}
