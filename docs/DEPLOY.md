# Deploying SkillSafe (free tier)

The scanner is client-only. No database, no API keys, no environment variables
are required to deploy it.

## Option A — Vercel CLI (fastest)

1. Create a free account at https://vercel.com (Hobby plan).
   Note: Hobby is for personal / non-commercial use. If SkillSafe becomes a
   business, move to Pro or to Cloudflare Pages.
2. In the project terminal:

   npx vercel@latest login
   npx vercel@latest --prod

3. Accept the prompts:
   - Set up and deploy: Yes
   - Scope: your account
   - Link to existing project: No
   - Project name: skillsafe
   - Directory: ./
   - Override settings: No

4. When it finishes, it prints a production URL like
   https://skillsafe-xxxx.vercel.app. Open it and run a sample scan.

## Option B — GitHub + Vercel dashboard

1. Create an empty GitHub repository named skillsafe.
2. Push this project:

   git init
   git add .
   git commit -m "SkillSafe client scanner + hardening"
   git branch -M main
   git remote add origin https://github.com/<you>/skillsafe.git
   git push -u origin main

3. In Vercel: Add New → Project → import the GitHub repo → Deploy.
   No environment variables are needed.

## Post-deploy checks

- Open the URL, click a sample, confirm the report renders.
- DevTools → Network: running a scan issues no request.
- Response headers include Strict-Transport-Security and Content-Security-Policy.
- Upload a small .zip skill and confirm it extracts and scans.

## What is not deployed

There is no backend in this build: no accounts, no saved reports, no server-side
threat-intel lookups. Those are later milestones and will need free-tier
Supabase / Safe Browsing credentials when added.
