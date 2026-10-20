# DevVision server

NestJS API behind DevVision. It lists the company's repos and turns each selected repo's `onboarding.md` into one onboarding guide using Google's Gemma (or any Gemini model) through the `@google/genai` SDK.

## Run

```bash
cd server
cp .env.example .env   # set GOOGLE_API_KEY; GITHUB_TOKEN is optional
npm install
npm run start:dev      # http://localhost:3000, Swagger UI at /docs
```

## Model

`LLM_MODEL` defaults to `gemma-4-31b-it`, served by the Gemini Developer API. Expect a minute or more per guide. Google's shared endpoints often return 500/503 under load, so failed calls are retried up to 3 times. If Gemma is too slow or unavailable, set `LLM_MODEL=gemini-3.8-flash`.

To use Vertex AI on Google Cloud instead, set `GOOGLE_GENAI_USE_VERTEXAI=true` and enable the Vertex AI (Agent Platform) API on the key's project.

## Endpoints

### `GET /repos`

Lists `GITHUB_OWNER`'s repos whose name contains `GITHUB_REPO_FILTER`. This matches what `https://github.com/jonathan-nobrega?tab=repositories&q=crewclaro` shows. Pass `?q=` to use a different filter.

```json
[
  {
    "name": "crewclaro-api",
    "fullName": "jonathan-nobrega/crewclaro-api",
    "url": "https://github.com/jonathan-nobrega/crewclaro-api",
    "description": null
  }
]
```

### `POST /onboarding`

For each repo, the server fetches `onboarding.md` from the root of its default branch. It joins those files with the company context, sends them to the LLM along with the master prompt in [`src/onboarding/master-prompt.ts`](src/onboarding/master-prompt.ts), and returns the generated guide.

The model answers in JSON mode against the schema in [`src/onboarding/onboarding-guide.ts`](src/onboarding/onboarding-guide.ts), so `guide` has one field per section and the web app can lay each one out. `markdown` is the same guide as a single Markdown document.

Each repo can be given as `"crewclaro-api"`, `"jonathan-nobrega/crewclaro-api"` or a GitHub URL. `developerName` and `department` are optional and personalise the guide.

```bash
curl -X POST localhost:3000/onboarding \
  -H 'content-type: application/json' \
  -d '{"repos": ["crewclaro-api", "crewclaro-web"], "developerName": "Alex", "department": "Backend & Platform"}'
```

```json
{
  "guide": {
    "title": "Onboarding guide: Backend & Platform",
    "welcome": "Welcome to the team, Alex! CrewClaro builds ...",
    "architecture": { "summary": "`crewclaro-web` talks to `crewclaro-api` over REST ...", "diagram": "graph TD\n  Web[\"crewclaro-web\"] --> API[\"crewclaro-api\"]" },
    "repos": [
      {
        "name": "crewclaro-api",
        "purpose": "The central backend ...",
        "stack": ["Node.js 22", "NestJS 10", "PostgreSQL 16"],
        "setup": [{ "step": "Start Postgres and Redis", "command": "docker compose up -d postgres redis" }],
        "gotchas": [{ "title": "Contract sync", "detail": "`src/queue/translation.types.ts` must match ..." }]
      }
    ],
    "firstWeek": ["Run `crewclaro-api` locally and open `http://localhost:4000`."],
    "glossary": [{ "term": "`translation:jobs`", "definition": "The Redis list ..." }],
    "gaps": [{ "topic": "Clerk setup", "detail": "No docs on configuring Clerk for local development." }]
  },
  "markdown": "# Onboarding guide: Backend & Platform\n\n## Welcome\n...",
  "model": "gemma-4-31b-it",
  "sources": [
    { "repo": "jonathan-nobrega/crewclaro-api", "url": "https://github.com/jonathan-nobrega/crewclaro-api/blob/HEAD/onboarding.md", "found": true },
    { "repo": "jonathan-nobrega/crewclaro-web", "url": "https://github.com/jonathan-nobrega/crewclaro-web/blob/HEAD/onboarding.md", "found": false }
  ]
}
```

Repos without an `onboarding.md` are skipped and reported with `found: false`. If none of the repos has one, the server returns `404` with the same `sources` list.

| Status | When |
|---|---|
| 400 | Invalid body, or a repo reference that can't be parsed |
| 404 | None of the repos has an `onboarding.md` |
| 502 | The GitHub or LLM request failed (including GitHub rate limits), or the model's reply couldn't be read as a guide |
| 503 | `GOOGLE_API_KEY` is not set |
