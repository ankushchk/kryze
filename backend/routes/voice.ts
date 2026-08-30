import { Router } from "express";
import multer from "multer";
import { interpretVoiceExpense } from "../controllers/voice.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();
const upload = multer({ limits: { fileSize: 12 * 1024 * 1024 } });

router.post("/interpret", authenticateToken, upload.single("audio"), interpretVoiceExpense);

export default router;
