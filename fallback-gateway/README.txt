LoopLink Free Fallback Gateway v0.1
===================================

Purpose
-------
A second, non-Cloudflare public front door for LoopLink while keeping the
existing Cloudflare Worker/D1/Durable Object system as the source of truth.

Normal:
  Device -> Cloudflare Worker

Fallback:
  Device -> Render free gateway -> Cloudflare Worker

This gateway contains no LoopLink database and no LoopLink admin/device secrets.
It transparently forwards HTTP and WebSocket traffic to the existing Worker.

Render deployment
-----------------
1. Put this folder in a GitHub repository or subfolder.
2. In Render, create a Web Service or Blueprint.
3. Select the FREE plan.
4. Build Command: npm install
5. Start Command: npm start
6. Health Check Path: /fallback-health

Local test
----------
npm install
npm run check
npm start

Then open:
http://localhost:10000/fallback-health
http://localhost:10000/fallback-upstream-health

Zero-cost note
--------------
For a strict zero-cost ceiling, do not add a payment method to the Render
workspace. Render documents that if a free service would incur charges and there
is no payment method, the service is disabled for the rest of that billing period
instead of billing you.

Important
---------
This is a CONTROL/SIGNALING fallback only. Do not relay WebRTC audio through it.

After this gateway is deployed and tested, patch Audio Portal to automatically try:
1) https://looplink-api.obserax.workers.dev
2) https://YOUR-SERVICE.onrender.com

Then add a separate free TURN fallback.
