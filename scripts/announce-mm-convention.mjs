#!/usr/bin/env node
// announce-mm-convention.mjs
//
// One-off lab announcement: ask 7 named recipients to upload all past + future
// Milestone Meeting slides to NAS using the convention MM_yymmdd_INIT.{pdf,pptx}.
//
// Mirrors the env loader + Supabase client construction used by other csnl-ops
// scripts so it picks up GMAIL_USER / GMAIL_APP_PASSWORD from .env.local.
//
// Usage:
//   node scripts/announce-mm-convention.mjs --dry-run   # preview only
//   node scripts/announce-mm-convention.mjs             # actually send

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Recipients
//   BCC (action requested) : 5 researchers who must upload their MM materials.
//   CC  (informational)    : PI + 2 researchers (BHL, SYJ) who currently have
//                            no MM materials to submit, but should be aware of
//                            the going-forward convention.
// ---------------------------------------------------------------------------
const ACTION_INITIALS = ['JOP', 'JYK', 'SMJ', 'BYL', 'MSY'];
const INFO_INITIALS   = ['BHL', 'SYJ'];

// ---------------------------------------------------------------------------
// .env loader (mirrors resolve-mm-slides.mjs)
// ---------------------------------------------------------------------------
const ENV_FILE = resolve(new URL('.', import.meta.url).pathname, '../.env.local');
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (existsSync(ENV_FILE)) {
    const raw = readFileSync(ENV_FILE, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n/g, '\n');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_APP    = process.env.GMAIL_APP_PASSWORD;

for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD: GMAIL_APP })) {
  if (!v) { console.error(`ERROR: ${k} not set`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Look up emails for the 7 initials
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'csnl_ops' }, auth: { persistSession: false },
});
const ALL_INITIALS = [...ACTION_INITIALS, ...INFO_INITIALS];
const { data: rows, error } = await supabase
  .from('researchers')
  .select('initial, full_name, email')
  .in('initial', ALL_INITIALS);
if (error) { console.error('DB error:', error.message); process.exit(1); }

const map = new Map(rows.map(r => [r.initial, r]));
const action = [];
const info = [];
const skipped = [];
for (const init of ACTION_INITIALS) {
  const r = map.get(init);
  if (!r?.email) { skipped.push({ initial: init, full_name: r?.full_name, reason: r ? 'email NULL' : 'not in researchers' }); continue; }
  action.push(r);
}
for (const init of INFO_INITIALS) {
  const r = map.get(init);
  if (!r?.email) { skipped.push({ initial: init, full_name: r?.full_name, reason: r ? 'email NULL' : 'not in researchers' }); continue; }
  info.push(r);
}

// PI for CC
const { data: piRows } = await supabase
  .from('researchers')
  .select('email, full_name')
  .eq('role', 'pi')
  .eq('active', true)
  .limit(1);
const piEmail = piRows?.[0]?.email ?? null;
const piFullName = piRows?.[0]?.full_name ?? null;
const ccList = [piEmail, ...info.map(r => r.email)].filter(Boolean);

// ---------------------------------------------------------------------------
// Email content (Korean)
// ---------------------------------------------------------------------------
const subject = '[CSNL] Milestone Meeting 자료 NAS 업로드 요청';

const text = `안녕하십니까. CSNL 운영팀입니다.

랩 운영 자동화 시스템(csnl-ops)이 Milestone Meeting(MM) 자료를 NAS에서 자동 인식하여
milestone_meetings 데이터베이스에 연결하도록 정비하고자 합니다. 이를 위해 지금까지
수행하신 모든 MM 발표 자료를 NAS의 지정된 위치에 옮겨 주시기 바랍니다.

[목적]
  · 과거·현재 MM 자료의 단일 보관 위치 확보
  · csnl-ops 시스템이 슬라이드 파일을 meeting_date 기준으로 자동 매핑
  · 향후 안내·리마인더 메일에 정확한 데이터를 활용

[업로드 위치]
  smb://147.47.70.15/CSNL_new/MM/{본인이니셜}/

  예시 (JOP의 경우):
    /Volumes/CSNL_new/MM/JOP/

[파일 명명]
  파일명에 미팅 날짜만 포함되어 있으면 됩니다. 정규화는 시스템(csnl-ops)이
  자동으로 처리합니다. 따라서 아래 형태 모두 허용됩니다.

    MM_260417.pptx
    MM_260417_JOP.pptx
    20260417_milestone.pdf
    260417_보고.key

  날짜는 YYMMDD 또는 YYYY-MM-DD 형식 모두 가능합니다.

[부속 자료 안내]
  슬라이드(.pptx, .pdf, .key)와 함께 다음 자료를 같은 폴더에 올려 주시면
  분석·요약 품질이 크게 향상됩니다(선택 사항이나 권장):
    · 발표 스크립트(.txt, .md, .docx 등)
    · 슬라이드 노트/코멘트(pptx 슬라이드 노트 영역 포함)
    · 관련 연구 노트, 데이터 로그, 후속 작업 메모

[요청 사항]
  지금까지 진행하신 모든 MM 자료를 위 위치로 옮겨 주시기 바랍니다.
  이번 주 내로 가능한 만큼 부탁드리며, 누락분은 후속 안내 메일이
  발송될 수 있습니다.

문의 사항은 본 메일에 회신해 주시면 됩니다.

감사합니다.
CSNL 운영팀 (csnl-ops)
`;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111;line-height:1.65;max-width:640px;margin:0 auto;padding:24px;">
  <p>안녕하십니까. <strong>CSNL 운영팀</strong>입니다.</p>
  <p>랩 운영 자동화 시스템(csnl-ops)이 Milestone Meeting(MM) 자료를 NAS에서 자동 인식하여
  <code>milestone_meetings</code> 데이터베이스에 연결하도록 정비하고자 합니다. 이를 위해
  지금까지 수행하신 <strong>모든 MM 발표 자료를 NAS의 지정된 위치에 옮겨 주시기</strong> 바랍니다.</p>

  <h3 style="margin-top:24px;">목적</h3>
  <ul>
    <li>과거·현재 MM 자료의 단일 보관 위치 확보</li>
    <li>csnl-ops 시스템이 슬라이드 파일을 meeting_date 기준으로 자동 매핑</li>
    <li>향후 안내·리마인더 메일에 정확한 데이터를 활용</li>
  </ul>

  <h3 style="margin-top:24px;">업로드 위치</h3>
  <pre style="background:#f4f4f4;padding:10px;border-radius:6px;font-size:0.92em;">smb://147.47.70.15/CSNL_new/MM/{본인이니셜}/

예시 (JOP의 경우):
  /Volumes/CSNL_new/MM/JOP/</pre>

  <h3 style="margin-top:24px;">파일 명명</h3>
  <p>파일명에 <strong>미팅 날짜만 포함</strong>되어 있으면 됩니다. 정규화는 시스템(csnl-ops)이
  자동으로 처리합니다. 따라서 아래 형태 모두 허용됩니다.</p>
  <pre style="background:#f4f4f4;padding:10px;border-radius:6px;font-size:0.92em;">MM_260417.pptx
MM_260417_JOP.pptx
20260417_milestone.pdf
260417_보고.key</pre>
  <p>날짜는 <code>YYMMDD</code> 또는 <code>YYYY-MM-DD</code> 형식 모두 가능합니다.</p>

  <h3 style="margin-top:24px;">부속 자료 안내</h3>
  <p>슬라이드(.pptx, .pdf, .key)와 함께 다음 자료를 같은 폴더에 올려 주시면
  분석·요약 품질이 크게 향상됩니다(선택 사항이나 권장).</p>
  <ul>
    <li>발표 스크립트(.txt, .md, .docx 등)</li>
    <li>슬라이드 노트/코멘트(pptx 슬라이드 노트 영역 포함)</li>
    <li>관련 연구 노트, 데이터 로그, 후속 작업 메모</li>
  </ul>

  <h3 style="margin-top:24px;">요청 사항</h3>
  <p>지금까지 진행하신 <strong>모든 MM 자료</strong>를 위 위치로 옮겨 주시기 바랍니다.
  이번 주 내로 가능한 만큼 부탁드리며, 누락분은 후속 안내 메일이 발송될 수 있습니다.</p>

  <p>문의 사항은 본 메일에 회신해 주시면 됩니다.</p>
  <p style="margin-top:32px;">감사합니다.<br><strong>CSNL 운영팀 (csnl-ops)</strong></p>
</body></html>`;

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
console.log('═══════════════════════════════════════════════════════════════');
console.log('Milestone Meeting upload-convention announcement (one-off)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Mode      : ${DRY_RUN ? 'DRY-RUN (no send)' : 'REAL SEND'}`);
console.log(`From      : ${GMAIL_USER}`);
console.log(`Reply-To  : ${GMAIL_USER}`);
console.log(`To (lead) : ${GMAIL_USER}`);
console.log(`Subject   : ${subject}`);
console.log();
console.log(`BCC — action requested (${action.length}):`);
for (const r of action) console.log(`  • ${r.initial.padEnd(4)} ${(r.full_name ?? '').padEnd(16)} ${r.email}`);
console.log();
console.log(`CC — informational (${ccList.length}):`);
console.log(`  • PI    ${(piFullName ?? '').padEnd(16)} ${piEmail}`);
for (const r of info) console.log(`  • ${r.initial.padEnd(4)} ${(r.full_name ?? '').padEnd(16)} ${r.email}`);
if (skipped.length) {
  console.log();
  console.log(`Skipped (${skipped.length}):`);
  for (const s of skipped) console.log(`  • ${s.initial.padEnd(4)} ${s.full_name ?? '(no record)'} — ${s.reason}`);
}
console.log();
console.log('───── plain text body preview ─────');
console.log(text);
console.log('───── end body ─────');

// ---------------------------------------------------------------------------
// Send (or stop here on dry-run)
// ---------------------------------------------------------------------------
if (DRY_RUN) {
  console.log('\n[dry-run] No email sent.');
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: { user: GMAIL_USER, pass: GMAIL_APP },
});

const result = await transporter.sendMail({
  from: `CSNL Lab <${GMAIL_USER}>`,
  to: GMAIL_USER,
  cc: ccList.length ? ccList : undefined,
  bcc: action.map(r => r.email),
  replyTo: GMAIL_USER,
  subject,
  text,
  html,
});

console.log(`\nSent. messageId=${result.messageId}, accepted=${result.accepted?.length}, rejected=${result.rejected?.length}`);
