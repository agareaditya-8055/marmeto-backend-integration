
import { AppDataSource } from "../../database/data-source";
import { Shipment, ShipmentStatus } from "../../entities/shipment.entity";
import { shipmentQueue } from "../../queues/shipment.queue";

interface ReplayResult {
  shipmentId: number;
  status: ShipmentStatus;
  message: string;
}

export async function replayFailedShipment(
  shipmentId: number,
): Promise<ReplayResult> {
  const shipmentRepository = AppDataSource.getRepository(Shipment);

  // Atomically allow replay only if the shipment is FAILED.
  const updateResult = await shipmentRepository.update(
    {
      id: shipmentId,
      status: ShipmentStatus.FAILED,
    },
    {
      status: ShipmentStatus.PENDING,
      attempts: 0,
      nextRetryAt: null,
      leaseExpiresAt: null,
      lastError: null,
    },
  );

  if (!updateResult.affected) {
    throw new Error(
      "Shipment not found or is not eligible for replay",
    );
  }

  const shipment = await shipmentRepository.findOne({
    where: { id: shipmentId },
    relations: { order: true },
  });

  if (!shipment) {
    throw new Error("Shipment not found after replay reset");
  }

  // Use a unique job ID because the previous failed BullMQ job
  // may still exist (removeOnFail is false).
  await shipmentQueue.add(
    "process-shipment",
    {
      shipmentId: shipment.id,
      orderId: shipment.order.orderId,
    },
    {
      jobId: `shipment-${shipment.id}-replay-${Date.now()}`,
    },
  );

  return {
    shipmentId: shipment.id,
    status: ShipmentStatus.PENDING,
    message: "Shipment queued for replay",
  };
}
