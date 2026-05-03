-- AlterTable
ALTER TABLE "Message" ADD COLUMN "hiddenForUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3);
