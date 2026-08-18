const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let _client = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your server environment (see .env.example) and restart the app. Get one at https://aistudio.google.com/apikey"
    );
  }
  if (!_client) _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _client;
}

async function jsonCompletion(systemPrompt, userPrompt) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("AI returned non-JSON output: " + text.slice(0, 300));
  }
}

const NO_INVENT_RULE = `HARD RULE — NEVER INVENT ANYTHING:
You may only use facts literally present in the CANDIDATE MASTER RESUME text
given below. Never fabricate or infer companies, job titles, dates, degrees,
certifications, skills, projects, achievements, or metrics that are not in
that text. You may reorganize, rephrase, reorder, emphasize, and trim — but
never add new factual content.`;

// Determine what role/opportunity a recruiter is likely hiring for, using
// only what Snov.io + the user gave us. If it's ambiguous, say so — the
// caller then asks the user directly instead of guessing.
async function detectRole({ recruiter, userJobTitle, userJobDescription }) {
  if (userJobTitle) {
    return {
      confident: true,
      role_title: userJobTitle,
      role_description: userJobDescription || null,
      reasoning: "Provided directly by the user.",
    };
  }

  const system = `You infer what hiring opportunity a recruiter/hiring manager most likely represents, using only their job title, company, and any other supplied signal.
Rules:
- If you cannot confidently identify a single specific role (e.g. the person's title is generic like "Talent Acquisition" with no other hiring signal), set confident=false. Do not guess a specific role in that case.
- Never invent job requirements not implied by the given information.
- Return strict JSON only.`;

  const schema = {
    confident: "boolean",
    role_title: "string|null",
    role_description: "string|null",
    reasoning: "string",
  };

  const user = `SCHEMA:
${JSON.stringify(schema, null, 2)}

RECRUITER INFO (from Snov.io / LinkedIn):
${JSON.stringify(recruiter, null, 2)}`;

  return jsonCompletion(system, user);
}

// Produce a tailored, ATS-friendly resume JSON strictly from the user's
// uploaded master resume text, optimized for the target company/role.
async function tailorResume({ masterResumeText, company, roleTitle, roleDescription }) {
  const system = `You are an expert ATS resume writer.
${NO_INVENT_RULE}
Your job: reorganize and rewrite (never fabricate) the candidate's master resume so it is optimized for the target role and company — prioritizing relevant experience and skills, tightening the summary, matching terminology the role would search for, and de-emphasizing irrelevant content.
Return strict JSON only, matching the given schema.`;

  const schema = {
    name: "string (candidate's actual name from resume)",
    contact_line: "string (email / phone / location / linkedin, from resume, pipe-separated)",
    summary: "string (3-4 sentences, rewritten for this role, only real facts)",
    skills: ["string (reordered/trimmed list of the candidate's actual skills, most relevant first)"],
    experience: [
      {
        title: "string (exact title from resume, not invented)",
        company: "string",
        dates: "string",
        bullets: ["string (rewritten for relevance, still 100% factual, ideally quantified if resume has numbers)"],
      },
    ],
    education: ["string"],
    certifications: ["string"],
  };

  const user = `SCHEMA:
${JSON.stringify(schema, null, 2)}

TARGET COMPANY: ${company || "unknown"}
TARGET ROLE: ${roleTitle || "unknown"}
ROLE DESCRIPTION / REQUIREMENTS (if any): ${roleDescription || "none provided"}

CANDIDATE MASTER RESUME (verbatim extracted text — the ONLY source of truth):
"""
${masterResumeText.slice(0, 20000)}
"""`;

  return jsonCompletion(system, user);
}

// Write a short, specific, non-generic outreach email using the recruiter's
// real info and the candidate's real (tailored) resume facts.
async function generateEmail({ recruiter, company, roleTitle, roleDescription, tailoredResume, masterResumeText }) {
  const system = `You write short, human, non-generic cold outreach emails from a real job candidate to a real hiring contact.
${NO_INVENT_RULE}
Additional rules:
- Greet by first name if known ("Hi [First Name],"); never "Dear Hiring Manager" if a name is available.
- Do not claim familiarity, mutual connections, or "loved your recent post" unless that information was actually supplied.
- Avoid cliché AI-outreach phrasing ("I hope this email finds you well", "I am writing to express my keen interest", "I believe I would be an excellent fit").
- Keep the body to roughly 120-180 words.
- Structure: greeting -> why contacting them (role + company) -> 2-3 strongest relevant, factual resume points for THIS role -> short call to action -> professional sign-off with the candidate's real name, phone, email, LinkedIn (from their resume/contact line).
- Also produce 3 distinct, non-clickbait subject line options; "subject" is your top pick.
- Return strict JSON only: {"subject_options": ["","",""], "subject": "", "body": ""}`;

  const user = `RECRUITER (from Snov.io / LinkedIn):
${JSON.stringify(recruiter, null, 2)}

TARGET COMPANY: ${company || "unknown"}
TARGET ROLE: ${roleTitle || "unknown"}
ROLE DESCRIPTION: ${roleDescription || "none provided"}

TAILORED RESUME (for reference, already factual):
${JSON.stringify(tailoredResume, null, 2)}

CANDIDATE MASTER RESUME (verbatim, for any contact-info details not present in the tailored JSON):
"""
${masterResumeText.slice(0, 8000)}
"""`;

  return jsonCompletion(system, user);
}

module.exports = { detectRole, tailorResume, generateEmail };
