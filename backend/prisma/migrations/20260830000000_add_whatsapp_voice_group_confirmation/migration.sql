-- Keep voice-created groups as a short-lived proposal until the sender confirms it.
ALTER TABLE "WhatsApp"
  ADD COLUMN "pendingGroupName" TEXT,
  ADD COLUMN "pendingGroupMemberIds" TEXT,
  ADD COLUMN "pendingGroupExpiresAt" TIMESTAMP(3);
