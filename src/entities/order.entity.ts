
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity({ name: "orders" })
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    name: "order_id",
    type: "varchar",
    length: 100,
    unique: true,
  })
  orderId!: string;

  @Column({
    name: "webhook_id",
    type: "varchar",
    length: 255,
    unique: true,
  })
  webhookId!: string;

  @Column({
    type: "jsonb",
  })
  address!: Record<string, unknown>;

  @Column({
  type: "jsonb",
})
items!: {
  id: number;
  title: string;
  quantity: number;
  price?: string;
  sku?: string | null;
}[];

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
  })
  createdAt!: Date;
}
