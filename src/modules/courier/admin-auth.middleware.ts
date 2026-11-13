import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

export function verifyAdminApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const providedKey = req.header("X-Admin-API-Key");

  if (!providedKey) {
    res.status(401).json({
      success: false,
      message: "Missing admin API key",
    });
    return;
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(env.ADMIN_API_KEY);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    res.status(401).json({
      success: false,
      message: "Invalid admin API key",
    });
    return;
  }

  next();
}