/*
  Warnings:

  - A unique constraint covering the columns `[cartId,slot]` on the table `Computer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nfc]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Computer" ALTER COLUMN "slot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nfc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Computer_cartId_slot_key" ON "Computer"("cartId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_nfc_key" ON "User"("nfc");
