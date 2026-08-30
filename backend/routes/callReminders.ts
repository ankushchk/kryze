import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  cancelCallReminder,
  connectTwilioReminderCall,
  createCallReminder,
  dispatchDueCallReminders,
  listCallReminders,
} from "../controllers/callReminders.js";

const router = Router();

router.post("/dispatch", dispatchDueCallReminders);
router.post("/twilio/outbound", connectTwilioReminderCall);
router.get("/", authenticateToken, listCallReminders);
router.post("/", authenticateToken, createCallReminder);
router.delete("/:id", authenticateToken, cancelCallReminder);

export default router;
