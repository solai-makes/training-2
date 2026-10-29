import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/index.js";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL must be configured");
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
