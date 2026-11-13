
import express, { Router } from "express";

import { verifyShopifyWebhook } from "./webhook.middleware";
import { ShopifyOrderWebhookSchema } from "./webhook.schema";
import { createOrderFromWebhook } from "./webhook.service";
import { shipmentQueue } from "../../queues/shipment.queue";

const router = Router();

router.post(
  "/orders-create",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      // Parse and validate the original request body.
      const parsedBody = ShopifyOrderWebhookSchema.safeParse(
        JSON.parse(req.body.toString("utf-8")),
      );

      if (!parsedBody.success) {
        res.status(400).json({
          success: false,
          message: "Invalid webhook payload",
          errors: parsedBody.error.issues,
        });
        return;
      }

      const webhookId = req.get("X-Shopify-Webhook-Id");

      if (!webhookId) {
        res.status(400).json({
          success: false,
          message: "Missing webhook ID",
        });
        return;
      }

      // Persist order and shipment in PostgreSQL.
      const result = await createOrderFromWebhook(
        parsedBody.data,
        webhookId,
      );

      // Enqueue shipment processing after the DB transaction commits.
      if (result.shipmentId !== null) {
        await shipmentQueue.add(
          "process-shipment",
          {
            shipmentId: result.shipmentId,
            orderId: result.orderId,
          },
          {
            jobId: `shipment-${result.shipmentId}`,
          },
        );
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("Webhook processing failed:", error);

      res.status(500).json({
        success: false,
        message: "Failed to process webhook",
      });
    }
  },
);

export default router;
