
import { Router } from "express";
import { verifyAdminApiKey } from "./admin-auth.middleware";
import { replayFailedShipment } from "./shipment.replay.service";

const router = Router();

router.post(
  "/shipments/:id/replay",
  verifyAdminApiKey,
  async (req, res) => {
    try {
      const shipmentId = Number(req.params.id);

      if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid shipment ID",
        });
        return;
      }

      const result = await replayFailedShipment(shipmentId);

      res.status(202).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Replay failed";

      const isIneligible =
        message === "Shipment not found or is not eligible for replay";

      res.status(isIneligible ? 409 : 500).json({
        success: false,
        message,
      });
    }
  },
);

export default router;
