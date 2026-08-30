import express from "express";
import "dotenv/config";
import { connectDatabase } from "./config/dbConnect.js";
import authRouter from "./routes/auth.js";
import draftsRouter from "./routes/drafts.js";
import groupsRouter from "./routes/groups.js";
import ocrRouter from "./routes/ocr.js";
import coinsRouter from "./routes/coins.js";
import premiumRouter from "./routes/premium.js";
import whatsappRouter from "./routes/whatsapp.js";
import voiceRouter from "./routes/voice.js";
import callRemindersRouter from "./routes/callReminders.js";
import { dispatchDueReminders } from "./controllers/callReminders.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/auth", authRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/ocr", ocrRouter);
app.use("/api/coins", coinsRouter);
app.use("/api/premium", premiumRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/voice", voiceRouter);
app.use("/api/call-reminders", callRemindersRouter);

app.get("/", (_req, res) => {
  res.json({ message: "Backend is running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  await connectDatabase();

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server is running on port ${port}`);
  });

  // Local-only convenience. Production should use the protected external cron
  // endpoint so multiple API instances cannot create duplicate calls.
  if (process.env.ENABLE_LOCAL_CALL_REMINDER_SCHEDULER === "true") {
    setInterval(() => {
      void dispatchDueReminders().catch((error) => {
        console.error("Local call reminder scheduler error:", error.message || error);
      });
    }, 60_000).unref();
    console.log("Local call reminder scheduler enabled (runs every minute).");
  }
}

void startServer();
