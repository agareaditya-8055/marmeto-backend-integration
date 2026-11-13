
const express = require("express");

const app = express();
const PORT = 4000;

app.use(express.json());

// In-memory storage is intentional for this mock service.
const shipments = new Map();

let nextShipmentId = 1001;

app.post("/shipments", async (req, res) => {
    const { reference, address, items } = req.body;

    if (!reference || !address || !Array.isArray(items)) {
        return res.status(400).json({
            message: "Invalid shipment payload",
        });
    }

    const random = Math.random();

    // 20% server error
    if (random < 0.2) {
        return res.status(500).json({
            message: "Mock courier server error",
        });
    }

    // 10% rate limit
    if (random < 0.3) {
        res.set("Retry-After", "2");

        return res.status(429).json({
            message: "Rate limit exceeded",
        });
    }

    // Create shipment
    const shipment = {
        shipmentId: `SHIP-${Date.now()}-${nextShipmentId++}`,
        reference,
        address,
        items,
        createdAt: new Date().toISOString(),
    };

    const existing = shipments.get(reference) || [];
    existing.push(shipment);
    shipments.set(reference, existing);

    // 10% timeout after successful creation
    if (random < 0.4) {
        console.log(
            `Shipment ${shipment.shipmentId} created, delaying response`,
        );

        await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    console.log("Shipment created:", shipment.shipmentId);

    return res.status(201).json({
        shipmentId: shipment.shipmentId,
        reference: shipment.reference,
    });
});

app.get("/shipments", (req, res) => {
    const { reference } = req.query;

    if (!reference) {
        return res.status(400).json({
            message: "reference query parameter is required",
        });
    }

    return res.status(200).json(
        shipments.get(String(reference)) || [],
    );
});

app.listen(PORT, () => {
    console.log(`Mock courier running at http://localhost:${PORT}`);
});
