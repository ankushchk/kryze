# Backend Deployment Guide for SplitX

This guide explains how to deploy your Express + TypeScript API server and the PostgreSQL database to production.

---

## Architecture Overview
1. **Express Server:** Containerized using the [Dockerfile](file:///Users/ankush/Desktop/kryze/backend/Dockerfile) (built on Node 20).
2. **Database:** Prisma ORM connected to PostgreSQL.
3. **External Services:** Twilio (SMS), OpenAI (AI OCR), Cloudinary (Image storage), and Razorpay (Payments).

---

## Option 1: PaaS Platforms (Railway, Render, Fly.io) - Recommended & Easiest
Using a Platform-as-a-Service (PaaS) is the easiest path. They handle provisioning SSL certificates, database hosting, auto-scaling, and Git integration automatically.

### Step 1: Deploy a Production Database
Instead of running Postgres in docker locally, use a managed provider:
- **Neon** (serverless Postgres, highly recommended) or **Supabase** (database only).
- Copy the Connection String (`postgresql://...`).

### Step 2: Deploy the Express App (e.g., on Railway or Render)
1. Push your repository to **GitHub**.
2. Connect your repository to **Railway** or **Render**.
3. The platform will automatically detect the `backend/Dockerfile` and compile the app.
4. Set the **Root Directory** of the service to `backend`.
5. Expose port `3000`.

### Step 3: Configure Environment Variables
In the platform settings, add the following variables:
```ini
NODE_ENV=production
PORT=3000
DATABASE_URL=your_production_postgres_connection_string
JWT_SECRET=use_a_secure_random_string_here
GOOGLE_CLIENT_ID=275273722443-g1s84gfspgk1l22l326c1jnti9afktno.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=275273722443-a123pm053nlr740ma4or23ilp70dmkvo.apps.googleusercontent.com
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_real_twilio_token
TWILIO_PHONE_NUMBER=your_real_twilio_number
OPENAI_API_KEY=your_openai_api_key
OPENAI_RECEIPT_MODEL=gpt-5
CLOUDINARY_CLOUD_NAME=rftzkz89
CLOUDINARY_API_KEY=938736664578443
CLOUDINARY_API_SECRET=your_cloudinary_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
DISABLE_REAL_SMS=false
ENABLE_ELEVENLABS_OUTBOUND_CALLS=false
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=agent_...
CALL_REMINDER_CRON_SECRET=use_a_long_random_value
```

### Opt-in ElevenLabs call reminders

The API includes call reminders but keeps them disabled until `ENABLE_ELEVENLABS_OUTBOUND_CALLS=true` is set. It uses the existing Twilio number to make the call, then connects it to the configured ElevenLabs agent; this preserves any inbound voice webhook already configured on the Twilio number.

Schedule an authenticated `POST https://your-api.example.com/api/call-reminders/dispatch` once per minute, with the `x-call-reminder-cron-secret` header set to `CALL_REMINDER_CRON_SECRET`. Use your hosting provider's cron service; the dispatcher is intentionally external so multiple server instances cannot double-call a user. The endpoint sends only reminders that were explicitly created with `callConsent: true`, and calls only the caller's verified account phone number.

---

## Option 2: VPS Server (DigitalOcean, AWS, Hetzner) using Docker Compose
If you prefer hosting it yourself using Docker on a virtual private server:

### Step 1: Install Docker and Docker Compose on your Server
Log into your server and run:
```bash
sudo apt update
sudo apt install docker.io docker-compose -y
```

### Step 2: Create a Production `docker-compose.yml`
On your server, create a `docker-compose.yml` file to run both the Postgres DB and the Express backend:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: splitx-postgres-prod
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_db_password
      POSTGRES_DB: splitx
    volumes:
      - splitx_postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: splitx-backend-prod
    restart: always
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://postgres:your_secure_db_password@postgres:5432/splitx?schema=public
      JWT_SECRET: your_production_jwt_secret
      GOOGLE_CLIENT_ID: "..."
      GOOGLE_IOS_CLIENT_ID: "..."
      TWILIO_ACCOUNT_SID: "..."
      TWILIO_AUTH_TOKEN: "..."
      TWILIO_PHONE_NUMBER: "..."
      OPENAI_API_KEY: "..."
      OPENAI_RECEIPT_MODEL: "gpt-5"
      CLOUDINARY_CLOUD_NAME: "..."
      CLOUDINARY_API_KEY: "..."
      CLOUDINARY_API_SECRET: "..."
      RAZORPAY_KEY_ID: "..."
      RAZORPAY_KEY_SECRET: "..."
      DISABLE_REAL_SMS: "false"
    depends_on:
      - postgres

volumes:
  splitx_postgres_data:
```

### Step 3: Run the Stack
Run the following command on your server to build the backend image and start the containers in the background:
```bash
docker-compose up -d --build
```
Prisma schema push & database setup will run automatically on container startup because of our `CMD` in the Dockerfile.

### Step 4: Reverse Proxy & SSL (Recommended)
Use **Caddy** or **Nginx** to expose the port `3000` to the internet with secure HTTPS (SSL).

For Caddy, your `Caddyfile` is as simple as:
```caddy
api.yourdomain.com {
    reverse_proxy localhost:3000
}
```
This automatically fetches and renews your free Let's Encrypt SSL certificate!
