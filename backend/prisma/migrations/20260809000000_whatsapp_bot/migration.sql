-- CreateTable
CREATE TABLE "WhatsApp" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "pendingDraftId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCommandLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "command" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsApp_userId_key" ON "WhatsApp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsApp_phone_key" ON "WhatsApp"("phone");

-- AddForeignKey
ALTER TABLE "WhatsApp" ADD CONSTRAINT "WhatsApp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCommandLog" ADD CONSTRAINT "BotCommandLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;