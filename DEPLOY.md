# Putting CampusFlow online

The project is ready for hosting. There is no build step, and no packages to install. You only
need a host that runs **Node.js 22.13+** and gives you a **persistent disk**, because the
database is one file (`campusflow.db`) and free plans usually erase files on every restart.

| | Render (recommended) | Railway | Your own VPS |
|---|---|---|---|
| Difficulty | Easiest | Easy | Medium |
| Uses | `render.yaml` | `Dockerfile` | `Dockerfile` |
| Keeps data | With a disk (paid plan) | With a volume | Yes |
| Address | `https://<name>.onrender.com` | `https://<name>.up.railway.app` | Your domain |

Check each site's current prices before choosing. Plans change often.

---

## Settings on a host
On your own computer, settings come from `.env`; add the variables you need there. On Render/Railway/Fly,
`.env` is **not** uploaded (it is in `.gitignore`); type the same variables in the host's
Environment settings instead. The front end and API are served from the same address there,
so `API_URL`, `FRONTEND_URL` and `CORS_ORIGINS` can stay unset.

## Step 0 — Put the project on GitHub (both Render and Railway need this)

You don't need to know Git.

1. Create a free account at **github.com**.
2. Click **+** (top right) → **New repository**. Name it `sti-campusflow`, choose **Private**, and click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Open the `STICampusFlow-v2` folder on your computer, select **everything inside it** (not the folder itself), and drag it into the browser.
   - **Don't upload the `data` folder.** It holds your local database and secret key.
5. Click **Commit changes**.

To update the site later, upload the changed files the same way. Render and Railway redeploy automatically.

---

## Option A — Render (recommended)

1. Create an account at **render.com** and sign in with GitHub.
2. Click **New** → **Blueprint**, and choose your `sti-campusflow` repository.
3. Render reads `render.yaml` and shows the settings. When asked for **ADMIN_PASSWORD**, type a strong password for the head registrar (`REG-001`).
4. Click **Apply**. The first deploy takes a few minutes.
5. Open the `https://….onrender.com` link at the top of the service page. It's done. QR codes on slips will automatically point to this address, so any phone anywhere can scan them.

**What `render.yaml` sets up:** Node 22, Philippine time, a 1 GB disk at `/var/data` for the database, the `/health` check, and the Singapore region (closest to the PH).

**Free test without a disk:** open `render.yaml`, delete the `disk:` block (the last 4 lines), and change `plan: starter` to `plan: free`. It works, but **all data resets whenever Render restarts or sleeps the app**. That's fine for a one-day demo, but not for real use. Free apps also take a while to wake up after being idle.

---

## Option B — Railway

1. Create an account at **railway.com** and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → choose `sti-campusflow`. Railway finds the `Dockerfile` by itself.
3. In the service, open **Variables** and add:
   - `ADMIN_PASSWORD` = a strong password
   - `SEED_MODE` = `demo` for the defense, or `minimal` for real use
4. Right-click the service → **Attach Volume**, and set the mount path to **`/data`**.
5. Go to **Settings** → **Networking** → **Generate Domain**, then open the link.

---

## Option C — Your own VPS (Ubuntu) with Docker

```bash
sudo apt update && sudo apt install -y docker.io
# copy the project folder to the server (e.g. with WinSCP), then inside it:
sudo docker build -t campusflow .
sudo docker run -d --name campusflow --restart unless-stopped \
  -p 80:3000 -v campusflow-data:/data \
  -e PUBLIC_URL=http://YOUR_SERVER_IP -e ADMIN_PASSWORD='ChangeMe2026' \
  campusflow
```
For `https`, put the server behind Cloudflare or a reverse proxy such as Caddy, then set `PUBLIC_URL=https://your-domain`.

---

## Email notices through Gmail

**Easiest way:** sign in as the head registrar (REG-001), open **Email setup** in the sidebar, type the Gmail address and its App Password, and press **Save and send test email**. No command window or restart is needed. The steps below are the manual alternative.

Every notification a student sees in the app is also sent to their school email:
the reminder a day before, the reminder on the day, status changes, payment results,
and office notices. Until this is set up, the messages print in the server console.

1. Sign in to the Gmail account the school will send from.
2. Turn on **2-Step Verification** (Google Account → Security). App passwords
   are not offered until this is on.
3. Go to **Google Account → Security → App passwords**, choose **Mail**, and copy
   the 16-character code it shows.
4. Set these two environment variables on your host (or edit `gmail` in `backend/config.js`):

```
GMAIL_USER=registrar.campusflow@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```

5. Restart. The console line **Email notices:** will read *Gmail (…)* instead of
   *not set up yet*.

Never use the Gmail account's real password here. An App Password only grants mail
sending and can be revoked on its own. To stop email entirely without removing the
settings, set `EMAIL_NOTIFICATIONS=off`.

### Where each student's mail goes

The address a student signs up with is their school Outlook address, and it stays
their account identity. Under **Account → Email notices** they choose whether
notices are emailed to that school address, to a personal address such as Gmail,
or not emailed at all.

The personal address option exists because Microsoft often files mail from a Gmail
sender into Junk. A student who misses reminders can point them at an inbox that
reliably receives them. Adding one sends a 6-digit code to that address first, and
nothing is delivered there until the code is entered, so a mistyped address cannot
leak someone's appointment details.

Gmail limits a free account to roughly 500 messages a day. For a whole campus,
move to Google Workspace or a mail service later; only `backend/core/mailer.js` changes.

| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail account and App Password used to send notices (see above). | not set, so notices print in the console |
| `EMAIL_NOTIFICATIONS` | Set to `off` to stop sending email. | on |
| `ALLOWED_EMAIL_DOMAINS` | School email domains allowed to sign in (comma-separated; subdomains count). | `sti.edu.ph` |

## Before real students use it

1. Set up **Gmail** (above) so students actually receive their reminders.
2. For real use, start fresh with `SEED_MODE=minimal` and a strong `ADMIN_PASSWORD`. This way the public demo password `Registrar@123` never exists on the live site.
   - On Render, delete and recreate the disk.
   - On Railway, delete and recreate the volume.
3. Upload the real registrar signature under **Slip signature**.
4. Staff passwords can't be changed in the app. To change the head registrar's password, change `ADMIN_PASSWORD` and start with an empty database, or ask your developer.

## Seeing the database on the host

- **Render:** open your service → **Shell** tab, then run:
  ```bash
  ls -la /var/data
  sqlite3 /var/data/campusflow.db ".tables"
  ```
  If `sqlite3` isn't available there, use the next step instead.
- **Any host (backup):** use the host's shell or file download to copy `campusflow.db`, then open it on your computer with **DB Browser for SQLite**.

## Built-in safety for a public site

- **Secure login cookies** over `https`.
- **HSTS**, so browsers always use `https`.
- **Login throttling:** 10 tries per 15 minutes.
- **Hashed passwords** (PBKDF2).
- **Signed QR links**, so slips can't be guessed or faked.
- **A `/health` check** the host uses to restart the app if it stops responding.
- **Clean shutdown on redeploy**, so the database is always saved properly.
