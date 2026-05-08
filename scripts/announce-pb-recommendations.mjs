#!/usr/bin/env node
// announce-pb-recommendations.mjs
//
// One-off heads-up email: at 18:00 KST today, an automated workflow will
// (a) Slack-DM 7 researchers a recommended latest paper for next week's
//     Paper Blitz, and
// (b) Slack-DM the PI a briefing on the lab-memory + AI-workflow status
//     curated by JOP.
//
// Run: node scripts/announce-pb-recommendations.mjs --dry-run
//      node scripts/announce-pb-recommendations.mjs

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const DRY_RUN = process.argv.includes('--dry-run');

const ACTION_INITIALS = ['MSY', 'JOP', 'SMJ', 'JYK', 'BYL', 'SYJ', 'BHL']; // 7 PB recipients (BCC)
const PI_INITIAL      = 'SL';

// .env loader
const ENV_FILE = resolve(new URL('.', import.meta.url).pathname, '../.env.local');
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      v = v.replace(/\\n/g, '\n');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_APP    = process.env.GMAIL_APP_PASSWORD;
for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, GMAIL_USER, GMAIL_APP })) {
  if (!v) { console.error(`ERROR: ${k} not set`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'csnl_ops' }, auth: { persistSession: false },
});

// Look up emails
const { data: rows, error } = await supabase
  .from('researchers')
  .select('initial, full_name, email')
  .in('initial', [...ACTION_INITIALS, PI_INITIAL]);
if (error) { console.error('DB error:', error.message); process.exit(1); }

const map = new Map(rows.map(r => [r.initial, r]));
const action = [];
const skipped = [];
for (const init of ACTION_INITIALS) {
  const r = map.get(init);
  if (!r?.email) { skipped.push({ initial: init, reason: r ? 'email NULL' : 'not in researchers' }); continue; }
  action.push(r);
}
const pi = map.get(PI_INITIAL);
if (!pi?.email) { console.error('ERROR: PI email missing'); process.exit(1); }

// Email content
const subject = '오늘(2026-05-08) 18시 KST 자동화 안내 — Paper Blitz 후보 논문 추천 및 교수님 브리핑';

const text = `안녕하십니까.

저는 CSNL 의 AI 도비(Dobby)를 만들고 있는 Claude 입니다.

(앞서 보내드린 메일의 제목 표기에 오류가 있어 동일 본문으로 재발송드립니다.
혼선드린 점 양해 부탁드립니다.)

JOP 연구원의 요청에 따라, 오늘(2026-05-08) 18시 KST 에 다음 두 가지
작업을 진행합니다.

1. Paper Blitz 후보 논문 추천
   대상: MSY, JOP, SMJ, JYK, BYL, SYJ, BHL (7명)
   방식: 각자에게 Slack 다이렉트 메시지로, 현재 연구 관심사에 맞춘
        최신 논문 한 편씩을 추천드립니다.
   활용: 추천드린 논문을 다음 주 수요일(2026-05-13) Paper Blitz 의
        발표 자료로 사용해 주시면 됩니다.

2. 이상훈 교수님께 별도 브리핑
   교수님께는 그동안 JOP 연구원이 정리해 온 연구실 자료와, 제가
   현재까지 진행해 온 자동화 작업의 현황 및 향후 계획을
   별도 Slack 다이렉트 메시지로 정리해 보고드립니다.

문의 사항은 본 메일에 회신해 주시면 됩니다.

감사합니다.
Claude (CSNL AI 도비 architect)
`;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111;line-height:1.65;max-width:640px;margin:0 auto;padding:24px;">
  <p>안녕하십니까.</p>
  <p>저는 CSNL 의 AI <strong>도비(Dobby)</strong>를 만들고 있는 <strong>Claude</strong> 입니다.</p>
  <p style="color:#555;font-size:0.92em;">(앞서 보내드린 메일의 제목 표기에 오류가 있어 동일 본문으로 재발송드립니다. 혼선드린 점 양해 부탁드립니다.)</p>
  <p>JOP 연구원의 요청에 따라, 오늘(2026-05-08) <strong>18시 KST</strong> 에 다음 두 가지 작업을 진행합니다.</p>

  <h3 style="margin-top:24px;">1. Paper Blitz 후보 논문 추천</h3>
  <ul>
    <li><strong>대상</strong>: MSY, JOP, SMJ, JYK, BYL, SYJ, BHL (7명)</li>
    <li><strong>방식</strong>: 각자에게 Slack 다이렉트 메시지로, 현재 연구 관심사에 맞춘 최신 논문 한 편씩을 추천드립니다.</li>
    <li><strong>활용</strong>: 추천드린 논문을 <strong>다음 주 수요일(2026-05-13) Paper Blitz</strong> 의 발표 자료로 사용해 주시면 됩니다.</li>
  </ul>

  <h3 style="margin-top:24px;">2. 이상훈 교수님께 별도 브리핑</h3>
  <p>교수님께는 그동안 JOP 연구원이 정리해 온 연구실 자료와, 제가 현재까지 진행해 온 자동화 작업의
  현황 및 향후 계획을 별도 Slack 다이렉트 메시지로 정리해 보고드립니다.</p>

  <p>문의 사항은 본 메일에 회신해 주시면 됩니다.</p>
  <p style="margin-top:32px;">감사합니다.<br>
  <strong>Claude (CSNL AI 도비 architect)</strong></p>
</body></html>`;

// Preview
console.log('═══════════════════════════════════════════════════════════════');
console.log('Tonight 18:00 KST workflow — heads-up email (one-off)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Mode      : ${DRY_RUN ? 'DRY-RUN (no send)' : 'REAL SEND'}`);
console.log(`From      : ${GMAIL_USER}`);
console.log(`Reply-To  : ${GMAIL_USER}`);
console.log(`To (lead) : ${GMAIL_USER}`);
console.log(`Subject   : ${subject}`);
console.log();
console.log(`BCC — action (${action.length}):`);
for (const r of action) console.log(`  • ${r.initial.padEnd(4)} ${(r.full_name ?? '').padEnd(16)} ${r.email}`);
console.log();
console.log(`CC — PI:`);
console.log(`  • ${pi.initial.padEnd(4)} ${(pi.full_name ?? '').padEnd(16)} ${pi.email}`);
if (skipped.length) {
  console.log();
  console.log(`Skipped (${skipped.length}):`);
  for (const s of skipped) console.log(`  • ${s.initial.padEnd(4)} ${s.reason}`);
}
console.log();
console.log('───── plain text body preview ─────');
console.log(text);
console.log('───── end body ─────');

if (DRY_RUN) { console.log('\n[dry-run] No email sent.'); process.exit(0); }

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: { user: GMAIL_USER, pass: GMAIL_APP },
});

const result = await transporter.sendMail({
  from: `CSNL Lab <${GMAIL_USER}>`,
  to: GMAIL_USER,
  cc: pi.email,
  bcc: action.map(r => r.email),
  replyTo: GMAIL_USER,
  subject, text, html,
});

console.log(`\nSent. messageId=${result.messageId}, accepted=${result.accepted?.length}, rejected=${result.rejected?.length}`);
