# Outreach AI — AI Hiring Manager Outreach Agent

Paste a recruiter's LinkedIn profile → find their info + email via Snov.io →
tailor your resume to the company/role with Gemini → get a personalized
outreach email → open it in Gmail, attach your resume, review, and send.

```
LinkedIn URL
     ↓
Snov.io: recruiter info + email
     ↓
Gemini: understand company + role
     ↓
Gemini: ATS-tailored resume (from YOUR uploaded resume only)
     ↓
Gemini: personalized outreach email
     ↓
Gmail compose (prefilled) — you review and send
```

## What's in this build

- **No Google Cloud, no Firestore, no Cloud Storage, no Gmail OAuth.**
  The app is stateless server-side except a short-lived in-memory session
  (cleared after 2 hours) that just holds one outreach flow's artifacts.
- **Snov.io** for LinkedIn profile enrichment and email finding
  (`server/snov.js`). Credentials are server-only env vars, never sent to
  the browser.
- **Gemini** (`server/ai.js`) for: detecting the target role, tailoring the
  resume, and writing the outreach email — always constrained to facts in
  the user's uploaded resume. It's told, repeatedly and explicitly, never
  to invent experience, companies, titles, dates, or skills.
- **Resume parsing** (`server/resumeParser.js`): PDF via `pdf-parse`, DOCX
  via `mammoth`. The extracted text is the single source of truth for every
  AI call in the flow.
- **Resume generation** (`server/resumeBuilder.js`): renders the AI's
  tailored resume JSON to a downloadable PDF (`pdfkit`) and DOCX (`docx`).
- **Gmail**: no OAuth. "Open in Gmail" builds a
  `https://mail.google.com/mail/?view=cm&...` compose URL with To/Subject/
  Body prefilled. You attach the downloaded resume yourself and click Send
  — nothing is ever sent automatically.

## Environment variables

See `.env.example`. You need:

- `GEMINI_API_KEY`, `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- `SNOV_API_USER_ID`, `SNOV_API_SECRET` — from your Snov.io account under
  Settings → API.

Set these in the Render dashboard (Environment tab) — never commit a real
`.env`.

## Local development

```bash
npm install
cp .env.example .env   # fill in real values
npm start
```

Visit `http://localhost:8080`.

## Deploying on Render

1. Push this repo to GitHub (or use Render's "Blueprint" with `render.yaml`
   already in this repo).
2. Render → New → Web Service → connect the repo. Build command
   `npm install`, start command `npm start` (already set in `render.yaml`
   if you use the Blueprint flow).
3. Add `GEMINI_API_KEY`, `GEMINI_MODEL`, `SNOV_API_USER_ID`,
   `SNOV_API_SECRET` in the Environment tab.
4. Deploy. Render gives you a public HTTPS URL — that's your app.

## Flow details / error handling

- Invalid LinkedIn URL → "Please enter a valid LinkedIn profile URL."
- Snov.io can't find the profile → "We couldn't retrieve this LinkedIn
  profile. Please verify the URL."
- Profile found but no email → resume tailoring and email generation still
  proceed; the UI shows "Not found" and a note instead of guessing an email.
- Role can't be confidently determined from the recruiter's profile → the
  UI asks directly: "What role are you applying for?"
- Resume upload fails (unsupported format, unreadable PDF, etc.) → clear
  inline error, nothing silently guessed.
- Gemini call fails → "The AI is temporarily unavailable. Please try again
  in a moment."

## Notes on the frontend

The UI (`public/`) is a single dark, motion-forward page: a lightweight
Three.js particle field in the background, a custom cursor with contextual
labels, and a 4-step guided flow (Recruiter → Resume → Role → Outreach).
It's intentionally not a full WebGL cinematic rebuild (scroll-driven camera
sequences, 3D document portals, etc.) — that's a substantially larger,
separate front-end project. This version keeps that visual language and
mood while staying fast, accessible, and easy to maintain; it's a solid
base to build a heavier cinematic version on top of later if you want that.

## Never fabricated

The AI is instructed, in every prompt, to use only what's literally present
in your uploaded resume — no invented companies, titles, dates, degrees,
certifications, skills, or metrics. It may only reorganize, rewrite, and
emphasize what's actually there.
