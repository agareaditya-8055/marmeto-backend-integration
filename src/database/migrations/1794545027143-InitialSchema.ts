
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794545027143 implements MigrationInterface {
  name = "InitialSchema1794545027143";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" SERIAL NOT NULL,
        "order_id" character varying(100) NOT NULL,
        "webhook_id" character varying(255) NOT NULL,
        "address" jsonb NOT NULL,
        "items" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_cad55b3cb25b38be94d2ce831db"
          UNIQUE ("order_id"),
        CONSTRAINT "UQ_cc01f51aa0ec5b8bb7948a8c53e"
          UNIQUE ("webhook_id"),
        CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f"
          PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."shipment_status_enum"
      AS ENUM (
        'PENDING',
        'PROCESSING',
        'CONFIRMED',
        'RETRY_WAIT',
        'FAILED',
        'RECONCILIATION_REQUIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" SERIAL NOT NULL,
        "courier_shipment_id" character varying(100),
        "status" "public"."shipment_status_enum"
          NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT '0',
        "next_retry_at" TIMESTAMP WITH TIME ZONE,
        "lease_expires_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" integer NOT NULL,
        CONSTRAINT "UQ_f6b52be142892d44109be9fd606"
          UNIQUE ("courier_shipment_id"),
        CONSTRAINT "REL_e86fac2a18a75dcb82bfbb23f4"
          UNIQUE ("order_id"),
        CONSTRAINT "CHK_shipments_attempts_non_negative"
          CHECK ("attempts" >= 0),
        CONSTRAINT "PK_6deda4532ac542a93eab214b564"
          PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shipments_status_next_retry"
      ON "shipments" ("status", "next_retry_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "shipments"
      ADD CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43"
      FOREIGN KEY ("order_id")
      REFERENCES "orders"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipments"
      DROP CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_shipments_status_next_retry"
    `);

    await queryRunner.query(`
      DROP TABLE "shipments"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."shipment_status_enum"
    `);

    await queryRunner.query(`
      DROP TABLE "orders"
    `);
  }
}
