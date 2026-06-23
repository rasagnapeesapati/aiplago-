// utils/textExtract.js
// Extracts plain text from uploaded files so the tools can process them
// regardless of format (txt, pdf, docx).

const fs = require('fs');
const path = require('path');

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.doc') {
    throw new Error(
      'Legacy .doc files are not supported. Please save as .docx, .pdf, or .txt and try again.'
    );
  }

  throw new Error(`Unsupported file type: ${ext}. Please upload .txt, .docx, or .pdf.`);
}

module.exports = { extractText };
