import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794545186806 implements MigrationInterface {
    name = 'InitialSchema1794545186806'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_shipments_status_next_retry"`);
        await queryRunner.query(`CREATE INDEX "IDX_shipments_processing_lease" ON "shipments" ("lease_expires_at") WHERE "status" = 'PROCESSING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_shipments_processing_lease"`);
        await queryRunner.query(`CREATE INDEX "IDX_shipments_status_next_retry" ON "shipments" ("status", "next_retry_at") `);
    }

}
