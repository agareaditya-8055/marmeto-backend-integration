
import { AppDataSource } from "../../database/data-source";
import {
  Shipment,
  ShipmentStatus,
} from "../../entities/shipment.entity";
import { Order } from "../../entities/order.entity";
import {
  createCourierShipment,
  findCourierShipments,
  CourierRequestError,
} from "./courier.client";

interface ShipmentJob {
  shipmentId: number;
  orderId: string;
}

function getBackoffDelay(attemptNumber: number): number {
  return Math.min(
    2000 * Math.pow(2, attemptNumber - 1),
    30000,
  );
}

async function markConfirmed(
  shipmentId: number,
  courierShipmentId: string,
): Promise<void> {
  await AppDataSource.getRepository(Shipment).update(
    { id: shipmentId },
    {
      status: ShipmentStatus.CONFIRMED,
      courierShipmentId,
      leaseExpiresAt: null,
      nextRetryAt: null,
      lastError: null,
    },
  );
}

async function markReconciliationRequired(
  shipmentId: number,
  reason: string,
): Promise<void> {
  await AppDataSource.getRepository(Shipment).update(
    { id: shipmentId },
    {
      status: ShipmentStatus.RECONCILIATION_REQUIRED,
      leaseExpiresAt: null,
      nextRetryAt: null,
      lastError: reason,
    },
  );
}

export async function processShipment(
  data: ShipmentJob,
  attemptNumber: number,
  maxAttempts: number,
): Promise<void> {
  // Atomically claim the shipment.
  const claimedRows = await AppDataSource.query(
    `
      UPDATE shipments
      SET
        status = $2,
        attempts = $5,
        lease_expires_at = NOW() + INTERVAL '2 minutes',
        next_retry_at = NULL,
        updated_at = NOW()
      WHERE
        id = $1
        AND status IN ($3, $4)
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      RETURNING id
    `,
    [
      data.shipmentId,
      ShipmentStatus.PROCESSING,
      ShipmentStatus.PENDING,
      ShipmentStatus.RETRY_WAIT,
      attemptNumber,
    ],
  );

  if (claimedRows.length === 0) {
    console.log(
      `Shipment ${data.shipmentId} is already claimed or not ready`,
    );
    return;
  }

  console.log(
    `Claimed shipment ${data.shipmentId}, attempt ${attemptNumber}/${maxAttempts}`,
  );

  const shipmentRepository = AppDataSource.getRepository(Shipment);

  // Load order information. Database errors are allowed to propagate.
  const shipment = await shipmentRepository.findOne({
    where: { id: data.shipmentId },
    relations: { order: true },
  });

  if (!shipment) {
    throw new Error(`Shipment ${data.shipmentId} not found`);
  }

  const order: Order = shipment.order;

  // Step 1: Check courier before creating anything.
  let existingShipments;

  try {
    existingShipments = await findCourierShipments(data.orderId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Courier lookup failed";

    await markReconciliationRequired(
      data.shipmentId,
      `Initial courier lookup failed: ${message}`,
    );

    console.error(
      `Cannot verify courier state for order ${data.orderId}`,
    );
    return;
  }

  if (existingShipments.length > 0) {
    if (existingShipments.length > 1) {
      console.error(
        `WARNING: ${existingShipments.length} courier shipments found for order ${data.orderId}`,
      );
    }

    const existingShipment = existingShipments[0];

    // Keep this outside the courier lookup catch.
    // A PostgreSQL error must not be treated as a courier error.
    await markConfirmed(
      data.shipmentId,
      existingShipment.shipmentId,
    );

    console.log(
      `Existing courier shipment confirmed: ${existingShipment.shipmentId}`,
    );
    return;
  }

  console.log(
    `No existing courier shipment found for order ${data.orderId}`,
  );

  // Step 2: Create the shipment at the courier.
  let courierShipment;

  try {
    courierShipment = await createCourierShipment({
      reference: data.orderId,
      address: order.address,
      items: order.items,
    });
  } catch (error) {
    // A timeout is ambiguous: courier may have created the shipment.
    if (
      error instanceof CourierRequestError &&
      error.isTimeout
    ) {
      console.warn(
        `Courier POST timed out for order ${data.orderId}. Checking courier again.`,
      );

      let recoveredShipments;

      try {
        recoveredShipments = await findCourierShipments(data.orderId);
      } catch (lookupError) {
        const message =
          lookupError instanceof Error
            ? lookupError.message
            : "Unknown lookup error";

        await markReconciliationRequired(
          data.shipmentId,
          `Timeout followed by failed reconciliation: ${message}`,
        );

        console.error(
          "Courier state is unknown. Shipment requires reconciliation.",
        );
        return;
      }

      if (recoveredShipments.length > 0) {
        if (recoveredShipments.length > 1) {
          console.error(
            `WARNING: ${recoveredShipments.length} courier shipments found after timeout for order ${data.orderId}`,
          );
        }

        // Database update is deliberately outside the lookup catch.
        await markConfirmed(
          data.shipmentId,
          recoveredShipments[0].shipmentId,
        );

        console.log(
          `Recovered shipment after timeout: ${recoveredShipments[0].shipmentId}`,
        );
        return;
      }

      // Do not POST again when the result of the first POST is ambiguous.
      await markReconciliationRequired(
        data.shipmentId,
        "Courier POST timed out, but no shipment was found during immediate reconciliation.",
      );

      console.warn(
        `No shipment found after timeout. Manual reconciliation required for order ${data.orderId}.`,
      );
      return;
    }

    // Handle normal courier failures (500, 429, network errors, etc.).
    const errorMessage =
      error instanceof Error ? error.message : "Unknown courier error";

    const retryDelayMs =
      error instanceof CourierRequestError
        ? error.retryDelayMs
        : getBackoffDelay(attemptNumber);

    const isFinalAttempt = attemptNumber >= maxAttempts;

    await shipmentRepository.update(
      { id: data.shipmentId },
      {
        status: isFinalAttempt
          ? ShipmentStatus.FAILED
          : ShipmentStatus.RETRY_WAIT,
        attempts: attemptNumber,
        nextRetryAt: isFinalAttempt
          ? null
          : new Date(Date.now() + retryDelayMs),
        leaseExpiresAt: null,
        lastError: errorMessage,
      },
    );

    console.error(
      `Shipment attempt ${attemptNumber} failed: ${errorMessage}`,
    );

    if (isFinalAttempt) {
      console.error(
        `Shipment ${data.shipmentId} reached maximum attempts and is marked FAILED`,
      );
    }

    throw error;
  }

  // Step 3: Save successful courier response.
  // This is outside the courier error catch.
  await markConfirmed(
    data.shipmentId,
    courierShipment.shipmentId,
  );

  console.log(
    `Courier shipment created successfully: ${courierShipment.shipmentId}`,
  );
}
