const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

// Extracts raw text from an uploaded resume (PDF or DOCX buffer).
// This raw text is the MASTER RESUME — the only source of truth the AI is
// allowed to draw from. Nothing here invents or infers content.
async function extractResumeText(buffer, mimetype, originalName = "") {
  const lower = (originalName || "").toLowerCase();

  if (mimetype === "application/pdf" || lower.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return data.text.trim();
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error("Unsupported resume format. Please upload a PDF or DOCX file.");
}

module.exports = { extractResumeText };
