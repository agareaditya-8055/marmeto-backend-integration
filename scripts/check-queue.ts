import { shipmentQueue } from "../src/queues/shipment.queue";

async function checkQueue() {
    for (const id of [2, 3]) {
        const job = await shipmentQueue.getJob(`shipment-${id}`);

        if (!job) {
            console.log(`Shipment ${id}: No BullMQ job found`);
            continue;
        }

        console.log({
            shipmentId: id,
            jobId: job.id,
            state: await job.getState(),
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
        });

        if ((await job.getState()) === "failed") {
            await job.remove();
            console.log(`Removed failed job for shipment ${id}`);
        }
    }

    console.log("Queue counts:", await shipmentQueue.getJobCounts());

    await shipmentQueue.close();

    const failedJobs = await shipmentQueue.getJobs(["failed"], 0, 20);

    for (const job of failedJobs) {
        console.log({
            jobId: job.id,
            shipmentId: job.data.shipmentId,
            state: await job.getState(),
            failedReason: job.failedReason,
        });
    }
}

checkQueue().catch(console.error);