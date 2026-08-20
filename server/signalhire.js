// SignalHire integration — the ONLY source of the recipient's email.
//
// SECURITY: SIGNALHIRE_API_KEY is read from a server-side env var ONLY.
// This module is never bundled into frontend JS.
//
// Per SignalHire's Person API docs
// (https://docs.signalhire.com/person-api/retrieve-person and
// https://docs.signalhire.com/person-api/without-waterfall):
//   POST https://www.signalhire.com/api/v1/candidate/search
//   headers: { apikey: SIGNALHIRE_API_KEY }
//   body:    { items: [linkedinUrl], withoutWaterfall: true }
//
// We use `withoutWaterfall: true` (synchronous mode) so the app can return
// a result directly in this same request/response cycle, without standing
// up a public callback endpoint. Trade-off (per SignalHire's docs): sync
// mode only searches SignalHire's internal data, so contact coverage can be
// slightly lower than the async/callback mode. Standard SignalHire credits
// are still consumed per matched profile either way.
//
// STRICT RULE (per project requirements): the email returned to the caller
// must come directly from SignalHire's `contacts` array — never generated,
// guessed, or constructed (e.g. first.last@domain), and never filled in by
// Gemini or any other service. If SignalHire returns no email contact,
// email stays null and the caller must show "Email not found".

const axios = require("axios");

const BASE_URL = "https://www.signalhire.com/api/v1";

function authHeaders() {
  const apiKey = process.env.SIGNALHIRE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SIGNALHIRE_API_KEY is not set. Add it as a server environment variable (see .env.example)."
    );
  }
  return { apikey: apiKey };
}

// Pick the best email SignalHire actually returned for this candidate.
// Never falls back to constructing/guessing an address.
function pickEmailFromContacts(contacts) {
  if (!Array.isArray(contacts) || !contacts.length) return null;

  const emails = contacts.filter((c) => c && c.type === "email" && c.value);
  if (!emails.length) return null;

  // Prefer a work/business email over a personal one.
  const work = emails.find((c) => c.subType === "work");
  if (work) return work.value;

  const personal = emails.find((c) => c.subType === "personal");
  if (personal) return personal.value;

  // Otherwise, take whichever email SignalHire returned first — still an
  // email SignalHire explicitly returned for this exact person, never a
  // guess.
  return emails[0].value;
}

function normalizeCandidate(candidate) {
  if (!candidate) return null;

  const currentExp =
    (Array.isArray(candidate.experience) && candidate.experience.find((e) => e && e.current)) ||
    (Array.isArray(candidate.experience) && candidate.experience[0]) ||
    null;

  const email = pickEmailFromContacts(candidate.contacts);

  return {
    full_name: candidate.fullName || null,
    title: currentExp?.position || null,
    company: currentExp?.company || null,
    company_site: currentExp?.website || null,
    location: (Array.isArray(candidate.locations) && candidate.locations[0]?.name) || null,
    email: email || null,
    email_found: Boolean(email),
    raw: candidate,
  };
}

// Retrieve a person's profile (and, if SignalHire has one on file, their
// email) by LinkedIn profile URL.
//
// Returns:
//   - a normalized profile object (email may be null — "not found" is not
//     an error) if SignalHire matched the profile
//   - null if SignalHire could not find/process this LinkedIn URL
// Throws on transport/auth/config failures.
async function findPersonByLinkedinUrl(linkedinUrl) {
  const headers = authHeaders();

  let data;
  try {
    const resp = await axios.post(
      `${BASE_URL}/candidate/search`,
      { items: [linkedinUrl], withoutWaterfall: true },
      { headers, timeout: 30_000 }
    );
    data = resp.data;
  } catch (e) {
    throw new Error(
      `SignalHire request failed: ${e.response?.data?.message || e.message}`
    );
  }

  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) {
    throw new Error("SignalHire returned an unexpected response for this LinkedIn profile.");
  }

  if (entry.status !== "success") {
    // failed / credits_are_over / duplicate_query — this profile could not
    // be retrieved right now.
    return null;
  }

  return normalizeCandidate(entry.candidate);
}

module.exports = { findPersonByLinkedinUrl };
