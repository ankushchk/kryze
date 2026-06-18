import express from "express";
import "dotenv/config";
import { connectDatabase } from "./config/dbConnect.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Backend is running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  await connectDatabase();

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

void startServer();
