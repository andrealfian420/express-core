import { Prisma, PrismaClient } from '@prisma/client'

/*
  Custom type to represent either a Prisma TransactionClient or the main PrismaClient instance.
  This allows us to type the transaction parameter in repository methods that can accept either.
*/
export type PrismaTx = Prisma.TransactionClient | PrismaClient
