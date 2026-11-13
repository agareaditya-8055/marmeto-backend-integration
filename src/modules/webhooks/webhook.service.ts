
import { AppDataSource } from "../../database/data-source";
import { Order } from "../../entities/order.entity";
import { Shipment, ShipmentStatus } from "../../entities/shipment.entity";
import type { ShopifyOrderWebhook } from "./webhook.schema";

interface CreateOrderResult {
    success: boolean;
    duplicate: boolean;
    orderId: string;
    shipmentId: number | null;
    message: string;
}

export async function createOrderFromWebhook(
    payload: ShopifyOrderWebhook,
    webhookId: string,
): Promise<CreateOrderResult> {
    const orderId = String(payload.id);

    return AppDataSource.transaction(async (manager) => {
        // Attempt to insert the order.
        // PostgreSQL unique constraints handle concurrent duplicate requests.
        const insertResult = await manager
            .createQueryBuilder()
            .insert()
            .into(Order)
            .values({
                orderId,
                webhookId,
                address: payload.shipping_address,
                items: payload.line_items,
            })
            .orIgnore()
            .returning(["id"])
            .execute();

        const insertedOrderId = insertResult.raw[0]?.id;

        // No row inserted means an order_id or webhook_id conflict occurred.
        if (!insertedOrderId) {
            // Look up both unique identifiers independently.
            const existingOrder = await manager.findOne(Order, {
                where: { orderId },
            });

            const existingWebhook = await manager.findOne(Order, {
                where: { webhookId },
            });

            // A webhook ID must never belong to a different order.
            if (
                existingWebhook &&
                (!existingOrder || existingWebhook.id !== existingOrder.id)
            ) {
                throw new Error(
                    "Webhook ID is already associated with a different order",
                );
            }

            // The order already exists: treat it as a duplicate.
            if (existingOrder) {
                const existingShipment = await manager.findOne(Shipment, {
                    where: {
                        order: { id: existingOrder.id },
                    },
                });

                return {
                    success: true,
                    duplicate: true,
                    orderId,
                    shipmentId: existingShipment?.id ?? null,
                    message: "Duplicate webhook ignored",
                };
            }

            throw new Error(
                "Duplicate constraint violation, but existing order was not found",
            );
        }

        // Create the initial shipment record in the same transaction.
        const shipmentResult = await manager.insert(Shipment, {
            order: { id: insertedOrderId },
            status: ShipmentStatus.PENDING,
            attempts: 0,
        });

        return {
            success: true,
            duplicate: false,
            orderId,
            shipmentId: shipmentResult.identifiers[0].id,
            message: "Order and shipment record created successfully",
        };
    });
}
