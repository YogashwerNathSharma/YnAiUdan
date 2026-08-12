import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();

export async function disconnectDatabase(): Promise<void> {
  await db.$disconnect();
}
