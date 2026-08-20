require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const signalhire = require("./signalhire");
const ai = require("./ai");
const { extractResumeText } = require("./resumeParser");
const { buildResumePdfBuffer, buildResumeDocxBuffer } = require("./resumeBuilder");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------------------------------------------------------------------
// In-memory session store. This is a single-user personal tool with no
// database — each "session" just holds the artifacts of one outreach flow
// (recruiter info, master resume text, tailored resume, generated email)
// long enough for the user to download/open them. Cleared after 2 hours.
// ---------------------------------------------------------------------
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function newSession() {
  const id = crypto.randomUUID();
  sessions.set(id, { createdAt: Date.now() });
  return id;
}
function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 30 * 60 * 1000).unref();

function isValidLinkedinUrl(url) {
  try {
    const u = new URL(url);
    return /(^|\.)linkedin\.com$/.test(u.hostname) && u.pathname.includes("/in/");
  } catch {
    return false;
  }
}

app.get("/healthz", (req, res) => res.json({ ok: true }));

// ------------------------------------------------------------------
// STEP 1: Analyze recruiter — LinkedIn URL -> SignalHire profile/email.
// SignalHire is the ONLY source of the recipient email (see server/signalhire.js).
// ------------------------------------------------------------------
app.post("/api/find-recruiter", async (req, res) => {
  const { linkedin_url } = req.body || {};

  if (!linkedin_url || !isValidLinkedinUrl(linkedin_url)) {
    return res.status(400).json({ error: "Please enter a valid LinkedIn profile URL." });
  }

  try {
    let profile;
    try {
      profile = await signalhire.findPersonByLinkedinUrl(linkedin_url);
    } catch (e) {
      return res.status(502).json({
        error: "We couldn't retrieve this LinkedIn profile. Please verify the URL.",
        detail: e.message,
      });
    }

    if (!profile || !profile.full_name) {
      return res.status(404).json({ error: "We couldn't retrieve this LinkedIn profile. Please verify the URL." });
    }

    const sessionId = newSession();
    const session = getSession(sessionId);
    session.linkedinUrl = linkedin_url;
    session.recruiter = profile;

    res.json({
      session_id: sessionId,
      recruiter: {
        name: profile.full_name,
        title: profile.title,
        company: profile.company,
        email: profile.email || null,
        email_found: Boolean(profile.email),
        linkedin_url,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Something went wrong finding this recruiter. Please try again.", detail: e.message });
  }
});

// ------------------------------------------------------------------
// STEP 2: Upload master resume for a session.
// ------------------------------------------------------------------
app.post("/api/upload-resume", upload.single("resume"), async (req, res) => {
  const { session_id } = req.body || {};
  const session = getSession(session_id);
  if (!session) return res.status(400).json({ error: "Session expired. Please start over." });
  if (!req.file) return res.status(400).json({ error: "Please upload a PDF or DOCX resume." });

  try {
    const text = await extractResumeText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 40) {
      return res.status(400).json({ error: "We couldn't read text from this resume. Please upload a text-based PDF or DOCX." });
    }
    session.masterResumeText = text;
    res.json({ ok: true, characters: text.length });
  } catch (e) {
    res.status(400).json({ error: e.message || "Failed to process resume upload." });
  }
});

// ------------------------------------------------------------------
// STEP 3: Determine role (auto, or from user-supplied title/description).
// ------------------------------------------------------------------
app.post("/api/detect-role", async (req, res) => {
  const { session_id, job_title, job_description } = req.body || {};
  const session = getSession(session_id);
  if (!session) return res.status(400).json({ error: "Session expired. Please start over." });
  if (!session.recruiter) return res.status(400).json({ error: "Find a recruiter first." });

  try {
    const role = await ai.detectRole({
      recruiter: session.recruiter,
      userJobTitle: job_title,
      userJobDescription: job_description,
    });
    if (role.confident) {
      session.role = role;
    }
    res.json(role);
  } catch (e) {
    res.status(502).json({ error: "The AI is temporarily unavailable. Please try again in a moment.", detail: e.message });
  }
});

// ------------------------------------------------------------------
// STEP 4: Generate tailored resume + personalized email in one go.
// ------------------------------------------------------------------
app.post("/api/generate", async (req, res) => {
  const { session_id, job_title, job_description } = req.body || {};
  const session = getSession(session_id);
  if (!session) return res.status(400).json({ error: "Session expired. Please start over." });
  if (!session.masterResumeText) return res.status(400).json({ error: "Upload your resume first." });
  if (!session.recruiter) return res.status(400).json({ error: "Find a recruiter first." });

  const roleTitle = job_title || session.role?.role_title;
  const roleDescription = job_description || session.role?.role_description;
  if (!roleTitle) {
    return res.status(409).json({ needs_role: true, error: "What role are you applying for?" });
  }

  try {
    const tailoredResume = await ai.tailorResume({
      masterResumeText: session.masterResumeText,
      company: session.recruiter.company,
      roleTitle,
      roleDescription,
    });

    const email = await ai.generateEmail({
      recruiter: session.recruiter,
      company: session.recruiter.company,
      roleTitle,
      roleDescription,
      tailoredResume,
      masterResumeText: session.masterResumeText,
    });

    session.role = { role_title: roleTitle, role_description: roleDescription, confident: true };
    session.tailoredResume = tailoredResume;
    session.email = email;

    const gmailUrl = buildGmailComposeUrl({
      to: session.recruiter.email,
      subject: email.subject,
      body: email.body,
    });

    res.json({
      session_id,
      recruiter: {
        name: session.recruiter.full_name,
        title: session.recruiter.title,
        company: session.recruiter.company,
        email: session.recruiter.email || null,
      },
      role: session.role,
      tailored_resume: tailoredResume,
      email,
      gmail_compose_url: gmailUrl,
    });
  } catch (e) {
    res.status(502).json({ error: "The AI is temporarily unavailable. Please try again in a moment.", detail: e.message });
  }
});

function buildGmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to || "",
    su: subject || "",
    body: body || "",
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

// ------------------------------------------------------------------
// Downloads
// ------------------------------------------------------------------
app.get("/api/download/resume.pdf", async (req, res) => {
  const session = getSession(req.query.session_id);
  if (!session || !session.tailoredResume) return res.status(404).send("Not found.");
  try {
    const buf = await buildResumePdfBuffer(session.tailoredResume);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename="${fileSafe(session.tailoredResume.name)}_Resume.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).send("Failed to generate PDF.");
  }
});

app.get("/api/download/resume.docx", async (req, res) => {
  const session = getSession(req.query.session_id);
  if (!session || !session.tailoredResume) return res.status(404).send("Not found.");
  try {
    const buf = await buildResumeDocxBuffer(session.tailoredResume);
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.set("Content-Disposition", `attachment; filename="${fileSafe(session.tailoredResume.name)}_Resume.docx"`);
    res.send(buf);
  } catch (e) {
    res.status(500).send("Failed to generate DOCX.");
  }
});

app.get("/api/download/email.eml", (req, res) => {
  const session = getSession(req.query.session_id);
  if (!session || !session.email) return res.status(404).send("Not found.");
  const to = session.recruiter?.email || "";
  const subject = session.email.subject || "";
  const body = session.email.body || "";
  const eml = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
  res.set("Content-Type", "message/rfc822");
  res.set("Content-Disposition", `attachment; filename="outreach_email.eml"`);
  res.send(eml);
});

function fileSafe(name) {
  return (name || "Candidate").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`AI Hiring Manager Outreach Agent listening on port ${PORT}`);
});
