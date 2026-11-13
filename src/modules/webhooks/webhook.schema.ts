import { z } from "zod";

export const ShopifyOrderWebhookSchema = z.object({
  id: z.number().int().positive(),
  order_id: z.number().int().positive(),
  email: z.string().email().optional(),

  shipping_address: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    province: z.string().optional(),
    zip: z.string().min(1),
    country: z.string().min(1),
    phone: z.string().optional(),
  }),

  line_items: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string().min(1),
      quantity: z.number().int().positive(),
      price: z.string().optional(),
      sku: z.string().nullable().optional(),
    }),
  ).min(1),
});

export type ShopifyOrderWebhook = z.infer<
  typeof ShopifyOrderWebhookSchema
>;