/**
 * Pure email template functions — no nodemailer, no side-effects.
 * All returned objects: { subject, text, html }.
 */

// Korean day-of-week abbreviations (Sunday = 0)
const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * Format a date string (YYYY-MM-DD or ISO) as "2026-04-17 (목)" in KST.
 * Accepts Date objects or ISO/date strings.
 */
export function formatDate(input: Date | string): string {
  // Parse as UTC midnight if a plain date string is supplied (YYYY-MM-DD)
  const d =
    typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)
      ? new Date(`${input}T00:00:00+09:00`)
      : new Date(input);

  // Render in KST (Asia/Seoul)
  const kstFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const datePart = kstFormatter.format(d); // "2026-04-17"

  // Day-of-week in KST
  const dowIndex = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  ).getDay();
  const dow = KO_DAYS[dowIndex];

  return `${datePart} (${dow})`;
}

// ---------------------------------------------------------------------------
// mmSlidesChaseTemplate
// ---------------------------------------------------------------------------

export interface MmMissingItem {
  meeting_date: string; // YYYY-MM-DD
  days_overdue: number;
}

export interface MmChaseRecipient {
  initial: string;
  full_name: string;
  email: string;
}

export interface MmSlidesChaseInput {
  recipient: MmChaseRecipient;
  missing: MmMissingItem[];
}

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export function mmSlidesChaseTemplate({
  recipient,
  missing,
}: MmSlidesChaseInput): EmailTemplate {
  const n = missing.length;
  const subject = `[CSNL] Milestone Meeting 슬라이드 업로드 요청 — ${n}건 미제출`;

  const bulletLines = missing
    .map(
      (m) =>
        `  • ${formatDate(m.meeting_date)} — ${m.days_overdue}일 경과`
    )
    .join("\n");

  const text = `${recipient.full_name} 연구원님께,

안녕하세요. CSNL 운영 시스템에서 자동 발송된 메일입니다.

아래 Milestone Meeting 슬라이드가 아직 업로드되지 않은 것으로 확인되었습니다 (총 ${n}건):

${bulletLines}

슬라이드를 가능한 한 빨리 업로드해 주시면 감사하겠습니다.
업로드 후 별도 회신은 불필요합니다.

문의 사항이 있으시면 회신해 주세요.

감사합니다,
CSNL 운영팀
`;

  const liItems = missing
    .map(
      (m) =>
        `<li style="margin-bottom:4px;">${formatDate(m.meeting_date)} &mdash; <strong>${m.days_overdue}일 경과</strong></li>`
    )
    .join("\n        ");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">
  <p>${recipient.full_name} 연구원님께,</p>
  <p>안녕하세요. CSNL 운영 시스템에서 자동 발송된 메일입니다.</p>
  <p>아래 Milestone Meeting 슬라이드가 아직 업로드되지 않은 것으로 확인되었습니다 (총 <strong>${n}건</strong>):</p>
  <ul style="padding-left:20px;">
        ${liItems}
  </ul>
  <p>슬라이드를 가능한 한 빨리 업로드해 주시면 감사하겠습니다.<br>
  업로드 후 별도 회신은 불필요합니다.</p>
  <p>문의 사항이 있으시면 회신해 주세요.</p>
  <p>감사합니다,<br>
  <strong>CSNL 운영팀</strong></p>
</body>
</html>`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// pbWeeklyTemplate
// ---------------------------------------------------------------------------

export interface PbWeeklyInput {
  next_meeting_date: string; // YYYY-MM-DD
}

export function pbWeeklyTemplate({
  next_meeting_date,
}: PbWeeklyInput): EmailTemplate {
  const displayDate = formatDate(next_meeting_date);
  const subject = `[CSNL] 다음주 수요일 Paper Blitz 준비 안내`;

  const text = `CSNL 구성원 여러분께,

안녕하십니까. 다음 주 Paper Blitz 안내드립니다.

  다음 Paper Blitz: ${displayDate} (수요일 10:00–11:30 KST)

Paper Blitz 는 PI 를 제외한 모든 구성원(박사과정, 석사과정, 포스닥)이 참여합니다.
각자 이번 주에 읽은 논문 한 편을 5분 내외로 발표해 주세요. 자료는
PB_yymmdd.pdf 로 NAS GRM 폴더에 업로드 부탁드립니다.

CWLL(이번 주 읽은 논문을 글로 소개 — APA, 키워드, 요약) 마감은
PB 전날(화요일) 자정입니다.

감사합니다.
CSNL 운영팀 (csnl-ops)
`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">
  <p>CSNL 구성원 여러분께,</p>
  <p>안녕하십니까. 다음 주 Paper Blitz 안내드립니다.</p>
  <p style="background:#f4f4f4;padding:12px 16px;border-radius:6px;font-size:1.05em;">
    <strong>다음 Paper Blitz:</strong> ${displayDate} <span style="color:#555;">(수요일 10:00&ndash;11:30 KST)</span>
  </p>
  <p>Paper Blitz 는 <strong>PI 를 제외한 모든 구성원</strong>(박사과정, 석사과정, 포스닥)이 참여합니다.<br>
  각자 이번 주에 읽은 논문 한 편을 <strong>5분 내외</strong>로 발표해 주세요. 자료는
  <code>PB_yymmdd.pdf</code> 로 NAS <code>GRM/</code> 폴더에 업로드 부탁드립니다.</p>
  <p>CWLL(이번 주 읽은 논문을 글로 소개 &mdash; APA, 키워드, 요약) 마감은
  <strong>PB 전날(화요일) 자정</strong>입니다.</p>
  <p>감사합니다.<br>
  <strong>CSNL 운영팀 (csnl-ops)</strong></p>
</body>
</html>`;

  return { subject, text, html };
}
