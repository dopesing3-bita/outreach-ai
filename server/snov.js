// Snov.io integration.
//
// SECURITY: SNOV_API_USER_ID / SNOV_API_SECRET are read from server-side
// env vars ONLY. This module is never bundled into frontend JS.
//
// Flow:
//   1. OAuth client-credentials token (cached, refreshed 60s before expiry).
//   2. Send the LinkedIn URL to Snov.io's LinkedIn Profile Enrichment API
//      (POST /v2/li-profiles-by-urls/start) and poll
//      GET /v2/li-profiles-by-urls/result?task_hash=... for the enriched
//      profile data (name, title, company, company site).
//   3. Snov.io's LinkedIn enrichment does not return an email address —
//      if we have a company domain, look one up via the name+domain email
//      finder.
//
// Per Snov.io's current API docs (https://snov.io/api), every authenticated
// request must send the access token as a Bearer token in the
// Authorization header — not as an `access_token` query/body param.

const axios = require("axios");

const BASE_URL = "https://api.snov.io";

// How long to keep polling an async /start -> /result task before giving up.
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

let _token = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;

  const userId = process.env.SNOV_API_USER_ID;
  const secret = process.env.SNOV_API_SECRET;
  if (!userId || !secret) {
    throw new Error(
      "SNOV_API_USER_ID / SNOV_API_SECRET are not set. Add them as server environment variables (see .env.example)."
    );
  }

  const { data } = await axios.post(`${BASE_URL}/v1/oauth/access_token`, {
    grant_type: "client_credentials",
    client_id: userId,
    client_secret: secret,
  });

  if (!data || !data.access_token) {
    throw new Error("Snov.io did not return an access token.");
  }

  _token = data.access_token;
  _tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000);
  return _token;
}

async function authHeaders() {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

// GET with Bearer auth. `params` becomes the query string.
async function snovGet(path, params = {}) {
  const headers = await authHeaders();
  const { data } = await axios.get(`${BASE_URL}${path}`, {
    params,
    headers,
    timeout: 20_000,
  });
  return data;
}

// POST with Bearer auth. Snov.io's /start endpoints (per their current
// docs/examples) take their input as query-string params on the POST
// request itself, with no JSON request body.
async function snovPostQuery(path, params = {}) {
  const headers = await authHeaders();
  const { data } = await axios.post(`${BASE_URL}${path}`, null, {
    params,
    headers,
    timeout: 20_000,
  });
  return data;
}

// POST with Bearer auth and a JSON body (used by endpoints that document a
// raw JSON payload rather than query params, e.g. the name+domain finder).
async function snovPostJson(path, body = {}) {
  const headers = await authHeaders();
  const { data } = await axios.post(`${BASE_URL}${path}`, body, {
    headers: { ...headers, "Content-Type": "application/json" },
    timeout: 20_000,
  });
  return data;
}

function extractDomain(urlOrDomain) {
  if (!urlOrDomain) return null;
  try {
    const u = urlOrDomain.includes("://") ? urlOrDomain : `https://${urlOrDomain}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Poll a Snov.io /result?task_hash=... endpoint until it reports
// status "completed" (or the timeout elapses).
async function pollResult(resultPath, taskHash, { timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastResp = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const resp = await snovGet(resultPath, { task_hash: taskHash });
    lastResp = resp;
    if (resp && resp.status === "completed") {
      return resp;
    }
  }

  throw new Error(
    `Snov.io did not finish this request within ${Math.round(timeoutMs / 1000)}s (last status: ${lastResp?.status || "unknown"}). Please try again.`
  );
}

// Step 1: enrich a LinkedIn profile URL via Snov.io's current LinkedIn
// Profile Enrichment API (POST /v2/li-profiles-by-urls/start, then
// GET /v2/li-profiles-by-urls/result?task_hash=...).
// Returns whatever Snov.io gives us — name, current title/company, and the
// company's site (used afterwards to look up an email by domain). This
// endpoint does not return an email address directly.
async function enrichLinkedinProfile(linkedinUrl) {
  let startResp;
  try {
    startResp = await snovPostQuery("/v2/li-profiles-by-urls/start", {
      "urls[]": linkedinUrl,
    });
  } catch (e) {
    throw new Error(
      `Failed to start LinkedIn profile enrichment on Snov.io: ${e.response?.data?.message || e.message}`
    );
  }

  const taskHash = startResp?.data?.task_hash;
  if (!taskHash) {
    throw new Error("Snov.io did not return a task_hash for this LinkedIn profile enrichment request.");
  }

  const resultResp = await pollResult("/v2/li-profiles-by-urls/result", taskHash);

  const entry = Array.isArray(resultResp.data) ? resultResp.data[0] : null;
  if (!entry) {
    throw new Error("Snov.io returned no result for this LinkedIn profile.");
  }

  // `result` is `[]` (an empty array, not an object) when Snov.io has no
  // data for this specific profile URL.
  const profile = entry.result && !Array.isArray(entry.result) ? entry.result : null;
  if (!profile) {
    return null;
  }

  return normalizeProfile(profile);
}

function normalizeProfile(p) {
  if (!p) return null;

  const firstName = p.first_name || null;
  const lastName = p.last_name || null;
  const fullName = p.name || [firstName, lastName].filter(Boolean).join(" ") || null;

  // `positions` is an array of roles Snov.io found for this person; the
  // first entry is their current/most recent one.
  const currentPosition = Array.isArray(p.positions) && p.positions.length ? p.positions[0] : null;

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    title: currentPosition?.title || null,
    company: currentPosition?.name || null,
    company_site: currentPosition?.url || null,
    location: p.location || null,
    email: null, // LinkedIn profile enrichment doesn't return an email.
    raw: p,
  };
}

// Step 2: if no email came back from enrichment, look one up by
// name + company domain via Snov.io's email finder
// (POST /v2/emails-by-domain-by-name/start, then
// GET /v2/emails-by-domain-by-name/result?task_hash=...).
async function findEmailByDomain({ firstName, lastName, domain }) {
  if (!domain) return null;

  let startResp;
  try {
    startResp = await snovPostJson("/v2/emails-by-domain-by-name/start", {
      rows: [
        {
          first_name: firstName || "",
          last_name: lastName || "",
          domain,
        },
      ],
    });
  } catch (e) {
    throw new Error(`Failed to start Snov.io email search: ${e.response?.data?.message || e.message}`);
  }

  const taskHash = startResp?.data?.task_hash;
  if (!taskHash) return null;

  let resultResp;
  try {
    resultResp = await pollResult("/v2/emails-by-domain-by-name/result", taskHash);
  } catch {
    // Non-fatal — the caller treats a missing email as "not found", not a hard failure.
    return null;
  }

  const entry = Array.isArray(resultResp.data) ? resultResp.data[0] : null;
  const candidates = entry?.result || [];
  const best = candidates.find((c) => c.smtp_status === "valid") || candidates[0];
  return best?.email || null;
}

module.exports = { getAccessToken, enrichLinkedinProfile, findEmailByDomain, extractDomain };
