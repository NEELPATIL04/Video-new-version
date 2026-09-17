-- CreateTable
CREATE TABLE "whiteboard_strokes" (
    "id" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "color" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "whiteboard_strokes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whiteboard_strokes_roomId_createdAt_idx" ON "whiteboard_strokes"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "whiteboard_strokes" ADD CONSTRAINT "whiteboard_strokes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whiteboard_strokes" ADD CONSTRAINT "whiteboard_strokes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
