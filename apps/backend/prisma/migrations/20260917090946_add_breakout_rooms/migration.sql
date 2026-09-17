-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "breakoutRoomId" TEXT;

-- CreateTable
CREATE TABLE "breakout_rooms" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "roomId" TEXT NOT NULL,

    CONSTRAINT "breakout_rooms_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_breakoutRoomId_fkey" FOREIGN KEY ("breakoutRoomId") REFERENCES "breakout_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakout_rooms" ADD CONSTRAINT "breakout_rooms_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
