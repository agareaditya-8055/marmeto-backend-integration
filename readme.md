# Marmeto Backend Integrations

A backend integration service that receives Shopify-style order webhooks, persists orders, processes courier shipments asynchronously, and handles duplicate events, courier failures, retries and shipment reconciliation.

## Overview

This project implements an order-to-shipment integration workflow.

When an order creation webhook is received, the service:

1. Validates the webhook using HMAC-SHA256.
2. Validates the incoming payload.
3. Persists the order and shipment records in PostgreSQL.
4. Enqueues shipment processing using BullMQ.
5. Returns an HTTP response without waiting for courier processing.

A background worker processes shipment jobs and communicates with a mock courier API.

The implementation focuses on reliable webhook processing, idempotency, asynchronous execution, retry handling and recovery from ambiguous courier responses.

## Architecture

```text
             Shopify / Webhook Sender
                       |
                       v
             POST /webhooks/orders-create
                       |
                       v
                HMAC Verification
                       |
                       v
                Payload Validation
                       |
                       v
              PostgreSQL Transaction
                  |           |
                  v           v
                Order      Shipment
                            PENDING
                              |
                              v
                        BullMQ Queue
                              |
                              v
                       Shipment Worker
                              |
                              v
                      Shipment Processor
                              |
                              v
                       Mock Courier API
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                 Success           Failure / Timeout
                    |                   |
                    v                   v
                CONFIRMED         Retry / Recovery

              Reconciliation Worker
                       |
                       v
             Finds eligible shipments
                       |
                       v
                 BullMQ Queue

              Admin Replay Endpoint
                       |
                       v
             Replay eligible FAILED
                    shipments
```

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Application runtime |
| Language | TypeScript | Type safety |
| HTTP framework | Express | API and webhook handling |
| Database | PostgreSQL | Persistent application state |
| ORM | TypeORM | Database entities and migrations |
| Queue | BullMQ | Asynchronous job processing |
| Queue storage | Redis / Upstash Redis | Queue storage |
| HTTP client | Axios | Courier API communication |
| Validation | Zod | Payload and environment validation |

## Implemented Features

### 1. Webhook Authentication

Endpoint:

`POST /webhooks/orders-create`

The service validates the `X-Shop-Hmac-Sha256` header using HMAC-SHA256 and the configured Shopify webhook secret.

The signature is calculated from the original raw request body and compared using a timing-safe comparison.

- Valid signature: request processing continues.
- Invalid signature: returns `401 Unauthorized`.
- Missing signature: returns `401 Unauthorized`.

The webhook route uses raw body parsing before signature verification to ensure that the signature is calculated against the original request bytes.

### 2. Payload Validation

The incoming webhook payload is validated using Zod.

Invalid payloads are rejected with `400 Bad Request`.

The service also requires the webhook delivery identifier from:

`X-Shopify-Webhook-Id`

### 3. Idempotent Webhook Processing

Webhook delivery is treated as an at-least-once operation.

The same webhook may be delivered multiple times, so the service prevents duplicate order and shipment creation.

The implementation uses:

- A unique constraint on `orders.order_id`.
- A unique constraint on `orders.webhook_id`.
- A PostgreSQL transaction for order and shipment creation.
- Conflict checks when an existing webhook ID is associated with a different order.

If the order already exists, the service returns a duplicate response instead of creating another shipment.

Concurrent webhook deliveries are protected by database uniqueness constraints and transactional writes.

### 4. Asynchronous Shipment Processing

The webhook handler does not wait for courier processing.

After persisting the order and shipment, it adds a job to BullMQ.

A separate background worker consumes jobs and communicates with the courier API.

This separates webhook handling from slower external API operations.

PostgreSQL stores the durable order and shipment state, while Redis is used for queue management.

### 5. Shipment State Management

The shipment lifecycle uses the following statuses:

| Status | Meaning |
|---|---|
| `PENDING` | Shipment is ready for processing |
| `PROCESSING` | A worker has claimed the shipment |
| `CONFIRMED` | Courier shipment has been confirmed |
| `RETRY_WAIT` | A transient failure occurred and retry is scheduled |
| `FAILED` | Automatic attempts have been exhausted |
| `RECONCILIATION_REQUIRED` | The outcome requires reconciliation or controlled recovery |

The shipment record also stores:

- Number of processing attempts.
- Next retry timestamp.
- Processing lease expiry.
- Courier shipment identifier.
- Last error.
- Created and updated timestamps.

### 6. Atomic Shipment Claiming

Before processing a shipment, the worker attempts to claim it using a conditional database update.

Only shipments in eligible states can be claimed.

This prevents multiple workers from simultaneously claiming the same eligible shipment.

The shipment record also stores a processing lease expiry timestamp.

### 7. Retry Strategy

Transient courier failures are retried using exponential backoff.

The retry delay is capped to avoid excessively long delays.

The implementation also respects the courier's `Retry-After` response header.

Retry scenarios include:

- HTTP 429 rate limiting.
- HTTP 500 server errors.
- Network failures.
- Request timeouts, subject to outcome reconciliation.

After the configured maximum number of attempts, the shipment is marked `FAILED`.

### 8. Handling Ambiguous Courier Timeouts

A timeout does not necessarily mean the courier failed to create the shipment.

For example:

1. The courier receives a shipment creation request.
2. The courier successfully creates the shipment.
3. The courier delays its response.
4. The client times out before receiving the response.

Blindly retrying the POST could create a duplicate shipment because the mock courier does not support idempotency.

To handle this scenario, the processor queries the courier using the order reference before attempting another creation.

If the shipment already exists, the service records its courier shipment ID and marks the shipment `CONFIRMED`.

If the outcome remains uncertain, the shipment is moved to `RECONCILIATION_REQUIRED` rather than blindly issuing another POST.

### 9. Reconciliation

The reconciliation process periodically checks PostgreSQL for eligible shipments:

- Pending shipments.
- Retry-wait shipments whose retry time has arrived.

Before enqueuing a shipment, it checks whether a corresponding BullMQ job already exists.

If an exhausted failed queue job exists for an eligible shipment, the reconciler removes it before creating a fresh job.

This helps recover eligible shipments when queue submission or processing has been interrupted.

### 10. Manual Shipment Replay

Endpoint:

`POST /admin/shipments/:id/replay`

The replay endpoint is protected by an admin API key supplied through:

`X-Admin-API-Key`

Only shipments in the `FAILED` state can be replayed.

A successful replay resets retry-related fields, moves the shipment back to `PENDING`, and creates a new BullMQ job.

## Project Structure

```text
src/
├── config/
│   ├── env.ts
│   └── redis.ts
│
├── database/
│   ├── migrations/
│   └── data-source.ts
│
├── entities/
│   ├── order.entity.ts
│   └── shipment.entity.ts
│
├── modules/
│   ├── webhooks/
│   │   ├── webhook.middleware.ts
│   │   ├── webhook.routes.ts
│   │   ├── webhook.schema.ts
│   │   └── webhook.service.ts
│   │
│   └── courier/
│       ├── admin-auth.middleware.ts
│       ├── courier.types.ts
│       ├── courier.client.ts
│       ├── shipment.processor.ts
│       ├── shipment.reconciliation.ts
│       ├── shipment.replay.service.ts
│       └── shipment.replay.routes.ts
│
├── queues/
│   └── shipment.queue.ts
│
├── workers/
│   ├── shipment.worker.ts
│   └── reconciliation.worker.ts
│
├── server.ts
└── worker.ts

scripts/
├── test-webhook.js
├── test-redis.ts
├── test-queue.ts
├── check-queue.ts

mock-courier.js
```

## Prerequisites

- Node.js 20 or later.
- npm.
- PostgreSQL.
- Redis with BullMQ-compatible TCP access.
- Upstash Redis can be used with a `rediss://` connection URL.

## Setup and Installation

### 1. Clone the repository

```bash
git clone https://github.com/agareaditya-8055/marmeto-backend-integration.git

cd marmeto-backend-integration
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_DATABASE=marmeto_integrations

SHOPIFY_WEBHOOK_SECRET=your_webhook_secret

REDIS_URL=rediss://default:your_password@your-redis-host:6379

ADMIN_API_KEY=your_generated_admin_api_key
```

Generate a strong admin API key instead of using a predictable value.

Never commit `.env` or real credentials to source control.

### 4. Create the PostgreSQL database

```sql
CREATE DATABASE marmeto_integrations;
```

### 5. Run database migrations

Build the project:

```bash
npm run build
```

Apply the migrations using the TypeORM migration command configured for the project's data source.

The application uses migrations rather than automatic schema synchronization.

### 6. Start the mock courier

In a separate terminal:

```bash
node mock-courier.js
```

The mock courier runs at:

`http://localhost:4000`

### 7. Start the API server

```bash
npm run dev
```

The API server runs at:

`http://localhost:3000`

### 8. Start the shipment worker

In another terminal:

```bash
npm run worker
```

The worker consumes shipment jobs from BullMQ.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API server in development mode |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start the compiled API server |
| `npm run worker` | Start the shipment background worker |

## API Endpoints

### Health Check

`GET /health`

Checks whether the API server is running.

### Shopify Order Webhook

`POST /webhooks/orders-create`

Required headers:

```http
Content-Type: application/json
X-Shopify-Webhook-Id: unique-webhook-id
X-Shop-Hmac-Sha256: <base64-hmac-signature>
```

Example successful response:

```json
{
  "success": true,
  "duplicate": false,
  "orderId": "987654332",
  "shipmentId": 12,
  "message": "Order and shipment record created successfully"
}
```

A duplicate request returns a successful response indicating that the webhook was ignored.

### Replay Failed Shipment

`POST /admin/shipments/:id/replay`

Required header:

```http
X-Admin-API-Key: <admin-api-key>
```

Example:

```bash
curl -X POST http://localhost:3000/admin/shipments/12/replay \
  -H "X-Admin-API-Key: your_generated_admin_api_key"
```

A successful replay returns HTTP `202 Accepted`.

## Mock Courier API

The mock courier provides the following endpoints.

### Create Shipment

`POST http://localhost:4000/shipments`

Example request:

```json
{
  "reference": "987654332",
  "address": {
    "address1": "123 Main Street",
    "city": "Mumbai",
    "country": "India"
  },
  "items": [
    {
      "title": "Sample Product",
      "quantity": 2
    }
  ]
}
```

### Find Shipment

`GET http://localhost:4000/shipments?reference=987654332`

Returns the shipment associated with the supplied order reference, if one exists.

### Simulated Failures

The mock courier simulates:

| Scenario | Approximate probability |
|---|---:|
| HTTP 500 | 20% |
| HTTP 429 with `Retry-After: 2` | 10% |
| Successful creation with delayed response | 10% |
| Normal successful response | 60% |

The delayed-response scenario creates the shipment before waiting 10 seconds to send the response.

This allows the client timeout and ambiguous-outcome recovery logic to be exercised.

The mock courier stores shipment data in memory. Restarting the mock server clears its stored shipments.

## Testing and Verification

The following scripts are available for manual testing.

### Webhook Authentication and Idempotency

```bash
node scripts/test-webhook.js
```

The webhook test script supports testing:

- Valid HMAC signature.
- Invalid HMAC signature.
- Missing HMAC signature.
- Duplicate webhook deliveries.
- Concurrent webhook deliveries.

The concurrent webhook test sends multiple requests using the same order ID and webhook ID.

Expected behavior: only one order and one shipment record are created.

### Redis Connectivity

```bash
npx tsx scripts/test-redis.ts
```

### Queue Connectivity

```bash
npx tsx scripts/test-queue.ts
```

### Queue Inspection

```bash
npx tsx scripts/check-queue.ts
```

Courier retries, timeout recovery, reconciliation and manual replay have also been exercised through the running application and mock courier.

These are manual verification scripts and scenarios, not a complete automated integration test suite.

## Design Decisions

### PostgreSQL as the source of truth

Order and shipment state must survive application restarts. PostgreSQL stores durable business state, while Redis is used for queue management.

### Database constraints for idempotency

Application-level checks alone are insufficient when multiple webhook requests arrive simultaneously.

Unique constraints and transactional writes enforce correctness at the database level.

### Separate API and worker processes

The API server handles incoming requests, while the worker handles external courier operations.

This prevents courier latency from directly affecting webhook processing.

### Courier lookup after ambiguous POST outcomes

The courier API does not provide idempotency support.

A timeout can occur after a successful side effect. Looking up the shipment by reference before another POST reduces the risk of duplicate shipment creation.

### Reconciliation

Database transactions and Redis queue operations do not share a distributed transaction.

The reconciliation process provides a recovery mechanism for eligible shipments when queue submission or processing is interrupted.

## Future Improvements

The following improvements are not part of the current implementation:

1. Introduce a transactional outbox for more robust database-to-queue event publication.
2. Add and verify recovery of expired `PROCESSING` leases after worker crashes.
3. Expand automated integration tests using isolated PostgreSQL and Redis instances.
4. Add distributed tracing and structured logging with correlation IDs.
5. Add metrics for queue latency, retry rates and courier error rates.
6. Add rate limiting and more granular administrative authorization.
7. Define retention and cleanup policies for completed and failed queue jobs.

## Security Considerations

- Webhook requests are authenticated using HMAC-SHA256.
- Signature comparisons use timing-safe comparison.
- Admin replay endpoints require an API key.
- Environment variables are validated at application startup.
- Secrets must be stored outside source control.
- Database operations use TypeORM query builders and parameterized queries.

## Author

**Aditya Agare**

GitHub: https://github.com/agareaditya-8055

---

Built as part of the Marmeto Backend Integrations take-home assignment.