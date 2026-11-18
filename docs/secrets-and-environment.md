# Secrets and environment management

## Secret inventory

The server uses these runtime secrets:

| Variable | Purpose | Handling |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Authenticates server-side Anthropic API calls | Keep in a local `.env` or AWS Secrets Manager |
| `OPENAI_API_KEY` | Authenticates server-side OpenAI API calls | Keep in a local `.env` or AWS Secrets Manager |
| `DATABASE_URL` | Connects the server to the database | Treat the full connection string, including its password, as a secret |
| `JWT_SECRET` | Verifies HS256 bearer tokens | Generate a random value of at least 32 bytes; never reuse an API key |
| `KMS_KEY_ID` | Identifies the AWS KMS key used by the encryption demo | Configure only when AWS KMS access is available |

`PORT`, `FRONTEND_ORIGIN`, and `AWS_REGION` configure the local server and are
not credentials.

These values must only be read by server-side code. Do not expose them through
client bundles, browser-visible configuration, API responses, logs, screenshots,
or error messages.

## Local development

1. Copy the root `.env.example` to `.env`.
2. Replace every placeholder with credentials from the appropriate provider and
   a development database. Do not use production credentials for local work.
3. Keep `.env` untracked. Do not paste credentials into source code, chat,
   tickets, or documentation; share them only through an approved secret
   sharing mechanism. Never commit actual `.env` files.

The root `.gitignore` excludes `.env` and `.env.*` files at any directory level
while allowing only `.env.example`. The example must contain placeholders, never
working credentials. If a credential is accidentally committed, revoke or rotate
it immediately; deleting the file in a later commit does not make the credential
safe.

## Local API server

The Express API lives in `server/`. Use Node.js 18 or newer, set the placeholder
values in the root `.env` to suitable local values, then run:

```powershell
cd server
npm install
npm run dev
```

By default, the API listens on port `3001` and accepts browser requests only
from `http://localhost:3000`. If the React development server uses another
port, set `FRONTEND_ORIGIN` to that exact origin (including scheme and port) in
the root `.env`. Requests with a different `Origin` receive HTTP 403; requests
from command-line clients without an `Origin` header are allowed.

Set `DATABASE_URL` in the root `.env` to a local PostgreSQL connection string.
From `server/`, run `npm run db:migrate` to apply pending migrations, or run
`npm run db:smoke` to apply pending migrations and insert one dummy row into
`"Telemetry_Logs"` to verify the connection pool. Each smoke-test run inserts
one row with `event_type` set to `connection_pool_smoke_test`.

`GET /api/health` is public and returns `{"status":"ok"}`. Protect application
routes by adding `authenticateToken` from
`server/src/api/middlewares/auth.js` to those routes. The middleware accepts
only HS256 bearer tokens signed with `JWT_SECRET`; token issuance and identity
provider integration are not included.

To run the KMS smoke test, configure AWS credentials using the AWS SDK's normal
credential chain, set `AWS_REGION` and `KMS_KEY_ID` in the root `.env`, and run
`npm run kms:demo` from `server/`. It encrypts only a hard-coded dummy string
and prints ciphertext, never an actual provider key. AWS KMS access is required;
the demo is not run automatically when the server starts.

## AWS cloud environments

Use **AWS Secrets Manager**, not Systems Manager Parameter Store, for these
credentials. All three are sensitive runtime secrets; Secrets Manager provides
purpose-built secret lifecycle and rotation support. Parameter Store remains
appropriate for non-secret configuration, but do not store these credentials
there.

Create separate Secrets Manager secrets for the Anthropic API key, OpenAI API
key, and database connection string. Separate secrets allow access and rotation
to be managed independently. Use environment-specific secret names, for
example:

- `myapp/dev/anthropic-api-key`
- `myapp/prod/anthropic-api-key`
- `myapp/dev/openai-api-key`
- `myapp/prod/openai-api-key`
- `myapp/dev/database-url`
- `myapp/prod/database-url`

For each deployed environment:

1. Provision the secret out of band or through infrastructure configuration
   that references an existing secret; never put secret values in source
   control, deployment manifests, image layers, or CI logs.
2. Grant the server workload's IAM role access only to the exact secrets it
   needs with `secretsmanager:GetSecretValue`. Grant `kms:Decrypt` only when a
   customer-managed KMS key is used, and scope it to that key.
3. Configure the cloud runtime to inject each secret into the server process
   under its corresponding environment variable name. Use the runtime's native
   secret-reference mechanism; do not copy secret values into ordinary
   deployment environment settings.
4. Keep secret values out of logs and diagnostics, and restrict who can read,
   update, or rotate secrets. Use separate AWS accounts or environment-specific
   access policies to prevent development workloads from reading production
   secrets.
5. Rotate provider keys by creating/replacing the key at the provider and
   updating its secret. Rotate database credentials using the database's
   supported rotation procedure; verify the application can reconnect before
   retiring the previous credential.

Do not pass these keys to browser code or expose them through a public API.
Review repository history and revoke credentials immediately if any real secret
is found in source control.
