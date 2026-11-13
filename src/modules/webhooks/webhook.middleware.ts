
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

import { env } from "../../config/env";

export function verifyShopifyWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const receivedSignature = req.get("X-Shop-Hmac-Sha256");

  if (!receivedSignature || !Buffer.isBuffer(req.body)) {
    res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
    return;
  }

  const expectedSignature = createHmac(
    "sha256",
    env.SHOPIFY_WEBHOOK_SECRET,
  )
    .update(req.body)
    .digest();

  let receivedBuffer: Buffer;

  try {
    receivedBuffer = Buffer.from(receivedSignature, "base64");
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
    return;
  }

  if (
    receivedBuffer.length !== expectedSignature.length ||
    !timingSafeEqual(receivedBuffer, expectedSignature)
  ) {
    res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
    return;
  }

  next();
}
