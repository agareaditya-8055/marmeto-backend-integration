
import { reconcileShipments } from "../modules/courier/shipment.reconciliation";

export async function runReconciliation(): Promise<void> {
  try {
    const count = await reconcileShipments();

    if (count > 0) {
      console.log(`Reconciliation: enqueued ${count} shipments`);
    }
  } catch (error) {
    console.error("Shipment reconciliation failed:", error);
  }
}
