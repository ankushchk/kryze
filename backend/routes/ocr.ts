import { Router } from 'express';
import multer from 'multer';
import { processReceiptOCR } from '../controllers/ocr.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // limit to 10MB
  },
});

// POST /api/ocr
router.post('/', authenticateToken, upload.single('image'), processReceiptOCR);

export default router;
