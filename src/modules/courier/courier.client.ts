
import axios, { AxiosError } from "axios";
import type {
  CourierShipmentRequest,
  CourierShipmentResponse,
} from "./courier.types";

const courierClient = axios.create({
  baseURL: "http://localhost:4000",
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
  },
});

export class CourierRequestError extends Error {
  constructor(
    message: string,
    public readonly retryDelayMs: number,
    public readonly statusCode?: number,
    public readonly isTimeout = false,
  ) {
    super(message);
    this.name = "CourierRequestError";
  }
}

function getRetryAfterMs(error: AxiosError): number | null {
  const retryAfter = error.response?.headers["retry-after"];

  if (!retryAfter) return null;

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(String(retryAfter));

  if (!Number.isNaN(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return null;
}

function normalizeCourierError(error: unknown): CourierRequestError {
  if (!axios.isAxiosError(error)) {
    return new CourierRequestError(
      error instanceof Error ? error.message : "Unknown courier error",
      2000,
    );
  }

  const statusCode = error.response?.status;
  const isTimeout =
    error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";

  const retryDelayMs =
    getRetryAfterMs(error) ?? 2000;

  return new CourierRequestError(
    isTimeout
      ? "Courier request timed out"
      : `Courier request failed${statusCode ? ` with HTTP ${statusCode}` : ""}`,
    retryDelayMs,
    statusCode,
    isTimeout,
  );
}

export async function createCourierShipment(
  payload: CourierShipmentRequest,
): Promise<CourierShipmentResponse> {
  try {
    const response = await courierClient.post<CourierShipmentResponse>(
      "/shipments",
      payload,
    );

    return response.data;
  } catch (error) {
    throw normalizeCourierError(error);
  }
}

export async function findCourierShipments(
  reference: string,
): Promise<CourierShipmentResponse[]> {
  try {
    const response = await courierClient.get<CourierShipmentResponse[]>(
      "/shipments",
      {
        params: { reference },
      },
    );

    return response.data;
  } catch (error) {
    throw normalizeCourierError(error);
  }
}
