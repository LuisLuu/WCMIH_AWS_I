
# Project V - Express API & Authentication

## Features
- Express API Server
- CORS origin validation
- JWT authentication middleware
- GET /api/health
- Mock AWS KMS encryption using AES-256-GCM

## Requirements
- Node.js 22
- npm
- Windows PowerShell

## Setup
1. Open terminal in the server folder.
2. Install dependencies:

   npm ci

3. Copy .env.example to .env.
4. Configure PORT, CLIENT_URL, JWT_SECRET and LOCAL_KMS_KEY.
5. Generate random secrets locally. Do not commit .env.

## Start Server

   node index.js

## Run Tests

Open another terminal in the server directory:

   powershell -NoProfile -File .\test-final.ps1

## Expected Result
All 11 tests should PASS.

## Important Notes
- AWS KMS is simulated locally.
- No real OpenAI API key is required.
- No AI Agent code is changed in this PR.
- The tests cover local behavior, not production security.
