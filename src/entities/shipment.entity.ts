
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
  Check,
} from "typeorm";

import { Order } from "./order.entity";

export enum ShipmentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  CONFIRMED = "CONFIRMED",
  RETRY_WAIT = "RETRY_WAIT",
  FAILED = "FAILED",
  RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED",
}

@Entity({ name: "shipments" })
@Check("CHK_shipments_attempts_non_negative", `"attempts" >= 0`)
@Index("IDX_shipments_status_next_retry", ["status", "nextRetryAt"])
@Index(
  "IDX_shipments_processing_lease",
  ["leaseExpiresAt"],
  {
    where: `"status" = 'PROCESSING'`,
  },
)
export class Shipment {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => Order, { nullable: false })
  @JoinColumn({ name: "order_id", referencedColumnName: "id" })
  order!: Order;

  @Column({
    name: "courier_shipment_id",
    type: "varchar",
    length: 100,
    unique: true,
    nullable: true,
  })
  courierShipmentId!: string | null;

  @Column({
    type: "enum",
    enum: ShipmentStatus,
    enumName: "shipment_status_enum",
    default: ShipmentStatus.PENDING,
  })
  status!: ShipmentStatus;

  @Column({
    type: "integer",
    default: 0,
  })
  attempts!: number;

  @Column({
    name: "next_retry_at",
    type: "timestamptz",
    nullable: true,
  })
  nextRetryAt!: Date | null;

  @Column({
    name: "lease_expires_at",
    type: "timestamptz",
    nullable: true,
  })
  leaseExpiresAt!: Date | null;

  @Column({
    name: "last_error",
    type: "text",
    nullable: true,
  })
  lastError!: string | null;

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamptz",
  })
  updatedAt!: Date;
}
