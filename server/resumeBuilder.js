const PDFDocument = require("pdfkit");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} = require("docx");

// `resume` is the AI-generated tailored resume JSON:
// {
//   name, contact_line, summary,
//   skills: ["..."],
//   experience: [{ title, company, dates, bullets: ["..."] }],
//   education: ["..."],
//   certifications: ["..."]
// }
// Every field must trace back to the user's uploaded master resume — the
// AI prompt enforces that; this module only lays it out.

function buildResumePdfBuffer(resume) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 46 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text(resume.name || "Resume", { align: "left" });
    if (resume.contact_line) {
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(resume.contact_line);
      doc.fillColor("#000");
    }
    doc.moveDown(0.6);
    line(doc);

    if (resume.summary) {
      section(doc, "Professional Summary");
      doc.font("Helvetica").fontSize(10.5).text(resume.summary, { align: "left" });
      doc.moveDown(0.6);
    }

    if (Array.isArray(resume.skills) && resume.skills.length) {
      section(doc, "Skills");
      doc.font("Helvetica").fontSize(10.5).text(resume.skills.join("  |  "));
      doc.moveDown(0.6);
    }

    if (Array.isArray(resume.experience) && resume.experience.length) {
      section(doc, "Experience");
      resume.experience.forEach((job) => {
        doc.font("Helvetica-Bold").fontSize(11).text(`${job.title || ""}${job.company ? " — " + job.company : ""}`);
        if (job.dates) {
          doc.font("Helvetica-Oblique").fontSize(9.5).fillColor("#555").text(job.dates);
          doc.fillColor("#000");
        }
        (job.bullets || []).forEach((b) => {
          doc.font("Helvetica").fontSize(10.2).text(`•  ${b}`, { indent: 10 });
        });
        doc.moveDown(0.45);
      });
    }

    if (Array.isArray(resume.education) && resume.education.length) {
      section(doc, "Education");
      resume.education.forEach((e) => doc.font("Helvetica").fontSize(10.2).text(e));
      doc.moveDown(0.6);
    }

    if (Array.isArray(resume.certifications) && resume.certifications.length) {
      section(doc, "Certifications");
      resume.certifications.forEach((c) => doc.font("Helvetica").fontSize(10.2).text(c));
    }

    doc.end();
  });
}

function section(doc, title) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor("#1a1a1a").text(title.toUpperCase());
  doc.fillColor("#000");
  doc.moveDown(0.15);
}

function line(doc) {
  const y = doc.y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor("#ccc").stroke();
  doc.moveDown(0.4);
}

async function buildResumeDocxBuffer(resume) {
  const children = [];

  children.push(new Paragraph({ text: resume.name || "Resume", heading: HeadingLevel.TITLE }));
  if (resume.contact_line) {
    children.push(new Paragraph({ children: [new TextRun({ text: resume.contact_line, size: 18, color: "555555" })] }));
  }

  if (resume.summary) {
    children.push(heading("Professional Summary"));
    children.push(new Paragraph({ text: resume.summary }));
  }

  if (Array.isArray(resume.skills) && resume.skills.length) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ text: resume.skills.join("  |  ") }));
  }

  if (Array.isArray(resume.experience) && resume.experience.length) {
    children.push(heading("Experience"));
    resume.experience.forEach((job) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${job.title || ""}${job.company ? " — " + job.company : ""}`, bold: true }),
          ],
        })
      );
      if (job.dates) {
        children.push(new Paragraph({ children: [new TextRun({ text: job.dates, italics: true, size: 18, color: "555555" })] }));
      }
      (job.bullets || []).forEach((b) => {
        children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
      });
    });
  }

  if (Array.isArray(resume.education) && resume.education.length) {
    children.push(heading("Education"));
    resume.education.forEach((e) => children.push(new Paragraph({ text: e })));
  }

  if (Array.isArray(resume.certifications) && resume.certifications.length) {
    children.push(heading("Certifications"));
    resume.certifications.forEach((c) => children.push(new Paragraph({ text: c })));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

function heading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.LEFT });
}

module.exports = { buildResumePdfBuffer, buildResumeDocxBuffer };
