# Kryze

Kryze is a voice-first expense and settlement assistant for groups. It helps people capture expenses from SMS, receipts, voice notes, and manual entry, then organize those costs into shared groups, track who owes what, and nudge people to settle up.

The codebase is split into two main apps:

- `backend`: an Express + TypeScript API with Prisma, PostgreSQL, Twilio, OpenAI, Cloudinary, Google sign-in, and ElevenLabs call reminders.
- `mobile`: an Expo + React Native app for the end user experience on iOS, Android, and web.

This repo is called `splitx` in a few package files, but the product experience and docs here use the Kryze name.

## What Kryze Does

Kryze is designed around a simple idea: spending and settlement should feel conversational instead of manual.

It can:

- Turn expense-related SMS messages into drafts.
- Parse receipts with OCR and structured AI extraction.
- Record voice notes and convert them into expense drafts.
- Organize people into groups and split expenses.
- Track coin-based rewards and premium access.
- Link WhatsApp for bot-driven workflows.
- Send opt-in reminder calls using ElevenLabs Agents + Twilio.

## Key Features

### Expense capture

- SMS inbox parsing for expense notifications.
- Receipt upload and OCR extraction.
- Voice-based expense entry.
- Draft review and editing before committing an expense.

### Group spending

- Create groups.
- Add and remove members.
- Create expenses inside a group.
- Split expenses among members.
- Verify or update expenses.
- Manage member UPI details for settlement flows.

### Settlements and rewards

- Coin balance and coin history.
- Redeem coins for premium access.
- Premium status checks.
- Settlement payment link generation.

### Messaging and automation

- WhatsApp linking and webhook handling.
- Draft creation from chat workflows.
- Opt-in voice call reminders for users who want a more proactive nudge.

## Tech Stack

### Mobile

- Expo Router
- React Native
- TypeScript
- Zustand
- Expo Audio
- Expo Camera
- Expo Notifications
- Expo Secure Store
- Expo Image Picker
- Google Sign-In
- SMS reading via a patched native module

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- Multer file uploads
- Twilio
- Cloudinary
- OpenAI
- ElevenLabs
- Google auth libraries

### Data and infrastructure

- PostgreSQL for persistence
- Prisma migrations and schema management
- Cloudflare tunnel for local webhook exposure when needed
- Optional Docker Compose for local PostgreSQL

## Architecture

The system is split into a client app and an API layer:

1. The mobile app captures user actions such as login, SMS import, receipt upload, voice recording, group management, and reminders.
2. The backend authenticates users, validates requests, and writes data to PostgreSQL through Prisma.
3. AI services process unstructured inputs:
   - OpenAI helps with receipt parsing and structured extraction.
   - ElevenLabs handles voice reminder conversations.
4. Twilio handles outbound and webhook-based communication.
5. Cloudinary stores uploaded receipt images.

For the reminder-call flow, Kryze keeps the user in control:

1. A user opts in to reminder calls.
2. The app stores a scheduled call reminder.
3. A protected scheduler dispatches due reminders.
4. The backend places the outbound call through Twilio.
5. Twilio connects the call to the configured ElevenLabs agent.
6. ElevenLabs delivers the reminder in a natural voice.

## Repository Layout

- [`backend`](./backend): API server, Prisma schema, controllers, routes, Docker Compose config, and deployment notes.
- [`mobile`](./mobile): Expo app, screens, UI components, hooks, and client-side API helpers.
- [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma): database schema.
- [`backend/.env.example`](./backend/.env.example): backend environment template.
- [`mobile/.env.example`](./mobile/.env.example): mobile environment template.

## Prerequisites

- Node.js 20 or newer
- `pnpm`
- PostgreSQL
- A Twilio account for SMS and calls
- An OpenAI API key
- A Cloudinary account
- A Google OAuth client if you use Google sign-in
- An ElevenLabs API key and agent if you want reminder calls

## Local Setup

### 1. Clone and install dependencies

Install dependencies in each app directory:

```bash
cd backend
pnpm install
```

```bash
cd ../mobile
pnpm install
```

### 2. Set up the database

The backend uses PostgreSQL through Prisma.

You can run Postgres locally with Docker Compose from the backend directory:

```bash
cd backend
docker compose up -d
```

Then point `DATABASE_URL` in `backend/.env` at the running database.

After the database is available, push the schema and generate the client:

```bash
pnpm prisma:push
pnpm prisma:generate
```

If you already have a database and migrations prepared, you can also use the normal Prisma migration workflow for your environment.

### 3. Configure backend environment variables

Copy the example file and fill in the real values:

- [`/Users/ankush/Desktop/kryze/backend/.env.example`](./backend/.env.example)

The most important variables are:

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `OPENAI_API_KEY`
- `OPENAI_EXPENSE_MODEL`
- `OPENAI_RECEIPT_MODEL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ENABLE_ELEVENLABS_OUTBOUND_CALLS`
- `CALL_REMINDER_CRON_SECRET`
- `ENABLE_LOCAL_CALL_REMINDER_SCHEDULER`

The reminder-call settings are opt-in and safe-by-default:

- `ENABLE_ELEVENLABS_OUTBOUND_CALLS=false` keeps live calls disabled.
- `ENABLE_LOCAL_CALL_REMINDER_SCHEDULER=true` is only for local development.
- Production should call `POST /api/call-reminders/dispatch` from an external protected scheduler.

### 4. Configure mobile environment variables

Copy the mobile example file and set the API URL and any client-specific values:

- [`mobile/.env.example`](./mobile/.env.example)

The mobile client reads `EXPO_PUBLIC_API_URL` and falls back to `http://localhost:3000` if it is not set. If you are running the backend locally, set that value to your reachable local URL or tunnel URL and restart Expo after changing it.

### 5. Start the backend

```bash
cd backend
pnpm dev
```

Useful backend scripts:

- `pnpm dev` starts the API in watch mode.
- `pnpm build` compiles the TypeScript server.
- `pnpm prisma:studio` opens Prisma Studio.
- `pnpm prisma:push` syncs the schema to the database.

The API exposes:

- `GET /` for a simple status response
- `GET /health` for health checks

### 6. Start the mobile app

```bash
cd mobile
pnpm start
```

Useful mobile scripts:

- `pnpm start` starts Expo
- `pnpm android` launches Android
- `pnpm ios` launches iOS
- `pnpm web` launches the web build
- `pnpm lint` runs Expo linting

## API Surface

The backend mounts the following route groups:

- `/api/auth`
- `/api/drafts`
- `/api/groups`
- `/api/ocr`
- `/api/coins`
- `/api/premium`
- `/api/whatsapp`
- `/api/voice`
- `/api/call-reminders`

### Notable flows

- Auth: signup, login, Google sign-in, phone verification, profile updates, user search.
- Drafts: create, list, and update expense drafts.
- Groups: create groups, manage members, add expenses, verify expenses, and create settlement payment links.
- OCR: receipt upload and parsing.
- Voice: voice-note expense interpretation.
- WhatsApp: link, unlink, status checks, and webhook handling.
- Call reminders: schedule, list, cancel, and dispatch opt-in voice reminders.

## ElevenLabs Reminder Calls

This is the later-stage feature that makes Kryze feel proactive instead of passive.

The current implementation uses:

- A Twilio outbound call from the backend.
- An ElevenLabs agent configured for reminder-only conversations.
- A protected dispatcher so reminders only go out when explicitly scheduled.

Important safety and product rules:

- Calls are opt-in only.
- Users must have a verified phone number.
- The backend does not enable live calls unless the environment flag is turned on.
- The scheduler is intentionally external in production to avoid duplicate calls.
- The agent is configured as a reminder assistant, not a general-purpose financial agent.

## Database Models

The Prisma schema includes support for:

- Users
- Phone verification
- Groups and group members
- Expenses and expense splits
- Transaction drafts
- Coin balances and coin ledgers
- Subscriptions
- WhatsApp link state
- Bot command logs
- Voice call reminders

## Deployment Notes

The backend deployment guide lives here:

- [`backend/DEPLOYMENT.md`](./backend/DEPLOYMENT.md)

That guide covers:

- PaaS deployment options
- Docker Compose deployment
- Environment variables
- Twilio, OpenAI, Cloudinary, and ElevenLabs configuration
- Reminder-call setup

If you are running the backend locally but need public webhooks for Twilio or Expo, a Cloudflare tunnel is a convenient option.

## Troubleshooting

### Backend won’t start

- Make sure PostgreSQL is running.
- Confirm `DATABASE_URL` is correct.
- Run `pnpm prisma:generate` after schema changes.
- Check for missing environment variables.

### Mobile app cannot reach the backend

- Confirm the API URL in `mobile/.env`.
- If you are using a local backend, expose it with a tunnel or use a reachable host.
- Restart Expo after changing environment variables.

### Reminder calls still show as coming soon

- Confirm `ENABLE_ELEVENLABS_OUTBOUND_CALLS=true` in the backend environment.
- Make sure the user has a verified phone number.
- Make sure `CALL_REMINDER_CRON_SECRET` is set and your scheduler sends it.
- Check that the backend can reach Twilio and ElevenLabs.

### Receipt or voice parsing fails

- Verify the OpenAI key is set.
- Check file-size limits for uploads.
- Make sure the backend can accept multipart form uploads.

## Contributing

This repo is currently optimized for active product development. If you add a feature, try to update:

- The backend route/controller layer
- The Prisma schema if data changes
- The mobile client if the feature is user-facing
- This README if the setup or architecture changes

## License

No explicit license is declared in the repository yet.
