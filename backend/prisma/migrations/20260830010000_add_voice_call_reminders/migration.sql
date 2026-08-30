CREATE TABLE "VoiceCallReminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerConversationId" TEXT,
    "lastError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceCallReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceCallReminder_status_scheduledFor_idx" ON "VoiceCallReminder"("status", "scheduledFor");
CREATE INDEX "VoiceCallReminder_userId_scheduledFor_idx" ON "VoiceCallReminder"("userId", "scheduledFor");

ALTER TABLE "VoiceCallReminder"
ADD CONSTRAINT "VoiceCallReminder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
