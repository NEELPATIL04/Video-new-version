-- CreateTable
CREATE TABLE "meeting_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultE2eeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agendaItems" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hostId" TEXT NOT NULL,

    CONSTRAINT "meeting_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "meeting_templates" ADD CONSTRAINT "meeting_templates_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
