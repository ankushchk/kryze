import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getLinkStatus,
  sendWhatsAppCode,
  linkWhatsapp,
  unlinkWhatsapp,
  whatsappWebhook,
} from "../controllers/whatsapp.js";

const router = Router();

// Public Twilio webhook (form-encoded). GET returns 200 for a sanity check from Twilio's console.
router.get("/webhook", (_req, res) => {
  res.type("text/xml").status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
});
router.post("/webhook", whatsappWebhook);

// Authed link management
router.get("/status", authenticateToken, getLinkStatus);
router.post("/send-code", authenticateToken, sendWhatsAppCode);
router.post("/link", authenticateToken, linkWhatsapp);
router.post("/unlink", authenticateToken, unlinkWhatsapp);

export default router;