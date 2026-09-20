import express, { Router, type IRouter, type Request, type Response } from "express";

import { logger } from "../lib/logger";
import { parseResendReceipt, verifyWebhookSignature } from "../lib/lifecycleEmailProvider";
import { recordDeliveryReceipt as defaultRecordDeliveryReceipt, type ReceiptOutcome } from "../lib/lifecycleOutbox";

/**
 * Provider delivery receipts for the lifecycle outbox.
 *
 * Mounted before the JSON body parser so the raw bytes can be verified against
 * the provider's signature. Every accepted callback is idempotent: a repeated
 * receipt for the same provider message id is a no-op, and a receipt for an
 * unknown id changes nothing. Without a configured secret the endpoint does
 * not exist (404), so an unverified callback can never mark anything delivered.
 */

export type LifecycleReceiptsRouterOptions = {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  recordDeliveryReceipt?: (providerMessageId: string, deliveredAt: Date) => Promise<ReceiptOutcome>;
};

export const LIFECYCLE_RECEIPT_PATH = "/lifecycle/delivery-receipts/resend";

export function createLifecycleReceiptsRouter(options: LifecycleReceiptsRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const record = options.recordDeliveryReceipt ?? defaultRecordDeliveryReceipt;

  router.post(
    LIFECYCLE_RECEIPT_PATH,
    express.raw({ type: () => true, limit: "256kb" }),
    async (req: Request, res: Response): Promise<void> => {
      const secret = env.LIFECYCLE_RECEIPT_WEBHOOK_SECRET?.trim();
      if (!secret) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const verification = verifyWebhookSignature(
        secret,
        { id: req.header("svix-id"), timestamp: req.header("svix-timestamp"), signature: req.header("svix-signature") },
        rawBody,
        now,
      );
      if (!verification.ok) {
        logger.warn({ event: "lifecycle_receipt.rejected", reason: verification.reason }, "Delivery receipt signature rejected");
        res.status(401).json({ error: "invalid_signature" });
        return;
      }
      const receipt = parseResendReceipt(rawBody, now);
      if (receipt.kind === "malformed") {
        res.status(400).json({ error: "malformed_receipt" });
        return;
      }
      if (receipt.kind === "ignored") {
        res.status(200).json({ outcome: "ignored", eventType: receipt.eventType });
        return;
      }
      const outcome = await record(receipt.providerMessageId, receipt.deliveredAt);
      logger.info({ event: "lifecycle_receipt.recorded", outcome }, "Delivery receipt processed");
      res.status(200).json({ outcome });
    },
  );

  return router;
}
