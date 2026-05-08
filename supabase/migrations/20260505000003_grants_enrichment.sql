-- =============================================================================
-- Migration: 20260505000003_grants_enrichment.sql
-- Purpose  : Enrich csnl_ops.grants with official title, grant code, and dates
--            for the two active grants seeded in 20260504000001_csnl_ops_seed_initial.sql.
--
-- Extraction method:
--   pdftotext was not available on this system; strings(1) and mdls(1) were used
--   as fallbacks. All PDFs in Grant/{대형장비구축_2024, 중견_2024}/ are scanned
--   (image-based), so embedded text extraction returns only binary noise.
--   HWP files similarly yielded no parseable Korean text via strings(1).
--
-- Audit trail per grant
-- ─────────────────────────────────────────────────────────────────────────────
-- 대형장비구축_2024
--   Dirs inspected:
--     /Volumes/CSNL_new-2/Grant/대형장비구축_2024/0_최초신청/최종제출본/
--     /Volumes/CSNL_new-2/Grant/대형장비구축_2024/3_협약용/최종제출본/
--     /Volumes/CSNL_new-2/Grant/대형장비구축_2024/6_2차년협약서/인프라고도화_240902_계획서/
--     /Volumes/CSNL_new-2/Grant/대형장비구축_2024/7_2차년결과보고서/최종제출본/
--     /Volumes/CSNL_new-2/Grant/대형장비구축_2024/ETC_서류/
--   Filename evidence:
--     "인프라고도화" appears in folder names and PDF filenames throughout →
--     this is a 기반연구시설·장비(인프라) 고도화 지원사업 grant.
--     ETC_서류/ lists "기반(인프라) 고도화 사업_서울대.hwp" confirming category.
--     양식2_01_이상훈.hwp confirms PI = 이상훈 (SL).
--     Directory "6_2차년협약서" → grant at least covers 2024–2025 (2nd year by 2024-09-02).
--   Fields set:
--     title     : '기반연구시설·장비 인프라 고도화 지원사업 (서울대학교)'
--                  — inferred from folder/filename; NOT extracted from official document
--                  (scanned PDF, not parseable). Mark as [inferred].
--     grant_no  : NULL — not extractable from scanned PDFs
--     start_date: NULL — not extractable
--     end_date  : NULL — not extractable
--   Recommendation: open 양식1_연구보안서약서_완료.pdf or 협약변경신청_변경사항표_final_추가수정_240902.pdf
--                   in a PDF viewer to retrieve grant code (과제번호) and dates.
--
-- 중견_2024
--   Dirs inspected:
--     /Volumes/CSNL_new-2/Grant/중견_2024/최종제출본/
--     /Volumes/CSNL_new-2/Grant/중견_2024/신청요강/
--     /Volumes/CSNL_new-2/Grant/중견_2024/연차보고서/2025/
--   Filename evidence:
--     최종제출본/ contains "Grant_2024_중견.pdf", "2024년_중견연구_협약용계획서.hwp"
--     신청요강/ contains "2024년도 과학기술정보통신부 개인기초연구사업 1차 신규과제 신청요강.hwp" →
--     category: 과기부 개인기초연구 (중견연구).
--     strings on Grant_2024_중견.pdf: "8SRS-c / RS-5RJ / RS-k" (binary fragments) →
--     likely grant code begins with "RS-" (NRF 중견연구 codes follow RS-2024-*).
--     No full code recoverable from scanned PDF.
--   Fields set:
--     title     : '개인기초연구(중견연구) — 시각 작업기억에서 이산화와 상대화 메커니즘'
--                  — project theme derived from csnl_meta_knowledge.md §BRL Grant핵심축
--                    (이산화/granularity + 상대화/relativization), cross-referenced with
--                    연구계획서 subject: behavior+neural of DV-space belief updating.
--                  — Mark as [inferred from meta_knowledge; verify against official document].
--     start_date: '2024-03-01' — inferred from grant year 2024 and typical NRF 중견연구
--                  start quarter (March); NOT confirmed from document. Set as estimate.
--     end_date  : '2027-02-28' — inferred from standard 3-year 중견연구 duration; NOT confirmed.
--   Recommendation: open Grant_2024_중견.pdf in a PDF viewer to retrieve official title
--                   (연구과제명), grant code (과제번호), and exact dates (연구기간).
--
-- NAS read failures:
--   All PDFs in both grant folders appear image-based (FlateDecode streams, no text layer).
--   pdftotext not installed (Homebrew). strings(1) fallback returned binary fragments only.
--   HWP files are proprietary binary format — no Korean text extractable via strings(1).
--   Permission denied on one SK Context file (00_ReadMe.txt) — unrelated to grants.
--
-- Idempotency: UPDATE statements only touch the two existing grant rows; re-running
--   is a no-op (same values written again).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Grant: 대형장비구축_2024
--   title  : [inferred from folder/filenames — verify from official document]
--   code field in grants table = '대형장비구축_2024' (folder-name key, set in seed)
--   No reliable start_date / end_date could be extracted.
-- ---------------------------------------------------------------------------

update csnl_ops.grants
   set title      = '[inferred] 기반연구시설·장비 인프라 고도화 지원사업 (서울대학교)',
       category   = '대형장비구축',
       start_date = null,
       end_date   = null
 where code = '대형장비구축_2024';

-- ---------------------------------------------------------------------------
-- Grant: 중견_2024
--   title  : [inferred from csnl_meta_knowledge.md — verify from Grant_2024_중견.pdf]
--   start_date / end_date : estimated from NRF 중견연구 standard 3-year cycle.
--   source : /Volumes/CSNL_new-2/Grant/중견_2024/최종제출본/Grant_2024_중견.pdf
--             (scanned, not parseable) + csnl_meta_knowledge.md §BRL Grant핵심축
-- ---------------------------------------------------------------------------

update csnl_ops.grants
   set title      = '[inferred] 개인기초연구(중견연구) — 시각 작업기억에서 이산화와 상대화 메커니즘',
       category   = '중견연구',
       start_date = '2024-03-01',
       end_date   = '2027-02-28'
 where code = '중견_2024';

-- =============================================================================
-- Summary
--   대형장비구축_2024 : title updated (inferred); start_date/end_date = NULL
--   중견_2024        : title, start_date, end_date updated (inferred/estimated)
--
-- Fields remaining NULL / unconfirmed (both grants):
--   - Official 연구과제명 (Korean full title)
--   - 과제번호 (grant code, e.g. RS-2024-XXXXXXX)
--   Reason: all source PDFs are scanned images; pdftotext unavailable.
--
-- Action required:
--   Open the following files in a PDF viewer and update via another migration:
--     대형장비구축 : Grant/대형장비구축_2024/3_협약용/최종제출본/
--                   협약변경신청_변경사항표_final_추가수정_240902.pdf  (has 과제번호 section)
--     중견_2024    : Grant/중견_2024/최종제출본/Grant_2024_중견.pdf    (cover page)
-- =============================================================================

commit;
