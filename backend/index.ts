import express from "express";
import "dotenv/config";
import { connectDatabase } from "./config/dbConnect.js";
import authRouter from "./routes/auth.js";
import draftsRouter from "./routes/drafts.js";
import groupsRouter from "./routes/groups.js";
import ocrRouter from "./routes/ocr.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/ocr", ocrRouter);

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
}

void startServer();

