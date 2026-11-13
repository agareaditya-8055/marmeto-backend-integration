
import { shipmentQueue } from "../src/queues/shipment.queue";

async function testQueue() {
  try {
    const job = await shipmentQueue.add("test-shipment", {
      shipmentId: 1,
      orderId: "TEST-ORDER-001",
    });

    console.log("Job added successfully");
    console.log("Job ID:", job.id);
    console.log("Job data:", job.data);
  } catch (error) {
    console.error("Queue test failed:", error);
    process.exitCode = 1;
  } finally {
    await shipmentQueue.close();
  }
}

void testQueue();
