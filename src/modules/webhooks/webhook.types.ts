export interface ShopifyOrderWebhook {
  id: number;
  order_id: number;
  email?: string;

  shipping_address: {
    first_name?: string;
    last_name?: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    zip: string;
    country: string;
    phone?: string;
  };

  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price?: string;
    sku?: string | null;
  }>;
}