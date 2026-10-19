# DevVision server

NestJS API behind DevVision. It lists the company's repos and turns each selected repo's `onboarding.md` into one onboarding guide using an OpenAI-compatible LLM.

## Run

```bash
cd server
cp .env.example .env   # set OPENAI_API_KEY; GITHUB_TOKEN is optional
npm install
npm run start:dev      # http://localhost:3000, Swagger UI at /docs
```

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

Each repo can be given as `"crewclaro-api"`, `"jonathan-nobrega/crewclaro-api"` or a GitHub URL. `developerName` and `department` are optional and personalise the guide.

```bash
curl -X POST localhost:3000/onboarding \
  -H 'content-type: application/json' \
  -d '{"repos": ["crewclaro-api", "crewclaro-web"], "developerName": "Alex", "department": "Backend & Platform"}'
```

```json
{
  "onboarding": "# Welcome to CrewClaro, Alex\n...",
  "model": "gpt-5.4-mini",
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
| 502 | The GitHub or LLM request failed (including GitHub rate limits) |
| 503 | `OPENAI_API_KEY` is not set |
