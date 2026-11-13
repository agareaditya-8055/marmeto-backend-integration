import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRetryIndex1794546566129 implements MigrationInterface {
    name = 'AddRetryIndex1794546566129'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_shipments_status_next_retry" ON "shipments" ("status", "next_retry_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_shipments_status_next_retry"`);
    }

}
