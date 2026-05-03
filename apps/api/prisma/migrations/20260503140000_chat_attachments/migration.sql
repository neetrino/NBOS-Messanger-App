-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachment" JSONB;

-- CreateTable
CREATE TABLE "ChatFile" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "storageFileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT,

    CONSTRAINT "ChatFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatFile_messageId_key" ON "ChatFile"("messageId");

-- CreateIndex
CREATE INDEX "ChatFile_conversationId_uploadedByUserId_idx" ON "ChatFile"("conversationId", "uploadedByUserId");

-- AddForeignKey
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
