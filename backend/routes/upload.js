// routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractText } = require('../utils/textExtract');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Unsupported file type. Please upload .txt, .docx, or .pdf.'));
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded.' });
  }

  try {
    const text = await extractText(req.file.path, req.file.originalname);
    fs.unlink(req.file.path, () => {}); // cleanup temp file, best-effort

    if (!text || !text.trim()) {
      return res.status(422).json({ error: 'Could not extract any text from this file.' });
    }

    res.json({ text, filename: req.file.originalname });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Upload extraction error:', err);
    res.status(422).json({ error: err.message || 'Failed to read this file.' });
  }
});

// Multer error handler (file too large, wrong type, etc.)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
