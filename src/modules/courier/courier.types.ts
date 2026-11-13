export interface CourierShipmentRequest {
  reference: string;
  address: Record<string, unknown>;
  items: Record<string, unknown>[];
}

export interface CourierShipmentResponse {
  shipmentId: string;
  reference: string;
}