
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { Order } from "../entities/order.entity";
import { Shipment } from "../entities/shipment.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,

  synchronize: false,
  logging: env.NODE_ENV === "development",

  entities: [Order, Shipment],

  migrations: [__dirname + "/migrations/*{.ts,.js}"],
  migrationsTableName: "migrations",
});
