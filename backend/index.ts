import express from "express";
import mongoose from "mongoose";
import "dotenv/config";

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
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      console.log("Connected to MongoDB");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to connect to MongoDB:", message);
    }
  } else {
    console.warn(
      "MONGODB_URI is not set. Starting server without database connection.",
    );
  }

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

void startServer();
