require("dotenv").config();

const crypto = require("crypto");

const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

if (!secret) {
    throw new Error("SHOPIFY_WEBHOOK_SECRET is missing from .env");
}

const url = "http://localhost:3000/webhooks/orders-create";

function generateSignature(payload) {
    return crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64");
}


async function sendWebhook(payload, webhookId, signature) {
    const headers = {
        "Content-Type": "application/json",
        "X-Shopify-Webhook-Id": webhookId,
    };

    // Add the signature header only when provided.
    if (signature !== null) {
        headers["X-Shop-Hmac-Sha256"] = signature;
    }

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
    });

    return {
        status: response.status,
        body: await response.json(),
    };
}



async function testHmacAuthentication() {
    // Generate unique identifiers for every test run.
    const testRunId = Date.now();
    const testOrderId = testRunId;

    const payload = JSON.stringify({
        id: testOrderId,
        order_id: testOrderId,
        email: "customer@example.com",
        shipping_address: {
            address1: "123 Main Street",
            city: "Mumbai",
            province: "Maharashtra",
            zip: "400001",
            country: "India",
        },
        line_items: [
            { id: 1, title: "Test Product", quantity: 2 },
        ],
    });

    const validSignature = generateSignature(payload);

    const tests = [
        ["Valid signature", validSignature, "valid"],
        ["Invalid signature", "invalid-signature", "invalid"],
        ["Missing signature", null, "missing"],
    ];

    for (const [name, signature, suffix] of tests) {
        const result = await sendWebhook(
            payload,
            `webhook-hmac-${testRunId}-${suffix}`,
            signature
        );

        console.log(`${name}: HTTP ${result.status}`);
        console.log(result.body);
    }
}


testHmacAuthentication().catch(console.error);



async function testConcurrentWebhooks() {
    // Use a fresh order ID and webhook ID for this test.
    const webhookId = "webhook-concurrent-005";

    const payload = JSON.stringify({
        id: 987654431,
        order_id: 987654431,
        email: "customer@example.com",
        shipping_address: {
            address1: "123 Main Street",
            city: "Mumbai",
            province: "Maharashtra",
            zip: "400001",
            country: "India",
        },
        line_items: [
            {
                id: 1,
                title: "Test Product",
                quantity: 2,
            },
        ],
    });

    const signature = generateSignature(payload);

    console.log("Sending 10 concurrent webhook requests...");

    const results = await Promise.all(
        Array.from({ length: 10 }, () =>
            sendWebhook(payload, webhookId, signature),
        ),
    );

    results.forEach((result, index) => {
        console.log(`Request ${index + 1}: HTTP ${result.status}`);
        console.log(result.body);
    });

    console.log("\nConcurrent webhook test completed.");
}

testConcurrentWebhooks().catch(console.error);
