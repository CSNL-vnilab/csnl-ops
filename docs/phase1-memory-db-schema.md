# Phase 1 Hierarchical Memory DB — Schema (2026-05-13)

> Output of round-2 Opus subagent consolidation. The structured rows that
> Phase 2+ natural-language query interface will read against.

## 0. Identity layer

```
state/orchestrator/
├── orchestrator_memory.md              # 전체 cross-researcher 요약 (markdown, human-readable)
├── orchestrator_log.jsonl              # round-by-round aggregation audit
├── researchers.json                    # 7 명의 메타 (init, name, role, mentor)
└── projects/
    └── <INIT>/
        └── <project_slug>.json         # 한 프로젝트 = 한 파일 (rich structured row)
```

`<project_slug>` 은 lowercase + underscore (e.g., `time2dist`, `biasvar`,
`dynamic_bias`, `concentricity`, `cat_mag_main`, `wmrepresentation_24`).

## 1. Project row schema (`projects/<INIT>/<project_slug>.json`)

```json
{
  "init": "JOP",
  "project_slug": "time2dist",
  "title": "Time → Distance uncertainty transfer",
  "active_since": "2024-11-01",
  "phase": "data_collection | analysis | manuscript_draft | submitted | revising | published | dormant",
  "purpose": {
    "research_question": "Absolute space → Relative space 로의 uncertainty transfer 증명",
    "hypothesis": "fixed subjective prior recovery + encoding model selection 이 trial-to-trial dynamics 보다 적합",
    "scientific_aim": "1-2 sentences on why this matters",
    "_grounding": ["nas:JOP/Time2Dist/README.md", "ledger:JOP_17:13_2026-05-12"]
  },
  "background": {
    "prior_studies": [
      {"doi": "10.7554/eLife.99290", "title": "...", "how_used": "fMRI baseline", "year": 2025},
      {"doi": null, "title": "Lee et al. 2025 iScience", "how_used": "seed paper", "year": 2025}
    ],
    "_grounding": ["nas:JOP/RingRepSca/LEGACY_INVENTORY.md"]
  },
  "apparatus": {
    "stimulus_software": "PsychToolbox | PsychoPy | jsPSych | Unity | custom",
    "stimulus_software_version": "PTB-3.0.18",
    "display": {"refresh_rate_hz": 60, "ppd": 49.5},
    "_grounding": ["nas:JOP/Time2Dist/Code/Experiment/main_duration.m:L12-30"]
  },
  "modalities": {
    "behavior": true,
    "eyetracker": {"present": false, "device": null},
    "fmri": {"present": false, "scanner": null},
    "eeg": {"present": false},
    "meg": {"present": false},
    "_grounding": ["nas:JOP/Time2Dist/Code/..."]
  },
  "experiment_design": {
    "paradigm_type": "estimation | discrimination | 2AFC | memory_recall | rating | other",
    "trial_structure": {
      "iti_s": [0, 1.5],
      "stimulus_window_s": [1.5, 3.0],
      "delay_s": [[3.0, 4.0], [5.5, 6.0]],
      "decision_window_s": [4.0, 5.5],
      "report_window_s": [6.0, 7.5]
    },
    "n_trials_per_session": null,
    "n_subjects": 12,
    "subject_codes": ["Sbj5", "Sbj6", "Sbj7", "Sbj8", "Sbj9", "Sbj10", "Sbj11", "Sbj12"],
    "_grounding": ["nas:JOP/Time2Dist/Data/results/timeExp1/"]
  },
  "manipulation_variables": {
    "independent_vars": [
      {"name": "prior_sigma", "type": "continuous", "range": [0.1, 1.0], "code_var": "sigma_prior"}
    ],
    "dependent_vars": ["estimate", "RT"],
    "fitted_parameters": [
      {"name": "sigma_abs", "description": "Absolute-space noise"},
      {"name": "sigma_rel", "description": "Relative-space noise"},
      {"name": "sigma_abs_leak", "description": "..."},
      {"name": "sigma_rel_leak", "description": "..."},
      {"name": "sigma_motor", "description": "Motor noise"}
    ],
    "_grounding": ["nas:JOP/Time2Dist/Code/.../fit_model.m"]
  },
  "code_artifacts": {
    "canonical_root": "JOP/Time2Dist/",
    "main_experiment": "Code/Experiment/main_duration.m",
    "main_experiment_mock": "Code/Experiment/main_duration_mock.m",
    "main_analysis": null,
    "key_scripts": [
      {"path": "Code/Experiment/main_duration.m", "purpose": "real experiment runtime"}
    ],
    "language": "MATLAB",
    "language_mix": null,
    "_grounding": ["nas_runs:20260513T050136Z_..."]
  },
  "data_artifacts": {
    "canonical_root": "JOP/Time2Dist/Data/",
    "raw_path": "Data/results/timeExp1/",
    "processed_path": null,
    "format": "MATLAB .mat",
    "size_gb_est": null,
    "_grounding": ["nas_runs:20260513T050136Z_..."]
  },
  "analysis_pipeline": {
    "steps": [
      {"name": "preprocess", "tool": "MATLAB", "path": null},
      {"name": "model_fit", "tool": "MATLAB", "path": null}
    ],
    "current_blocker": null,
    "_grounding": []
  },
  "results": {
    "summary": "Exp1 (reproduction) 분석 5월 14일 마감 예정",
    "key_findings": [],
    "_grounding": ["ledger:JOP_15:14_2026-05-12"]
  },
  "interpretation": {
    "researcher_view": "fixed subjective prior recovery + encoding model selection 이 더 적합",
    "open_questions": ["prior 정의 코드 위치"],
    "_grounding": ["ledger:JOP_17:19_2026-05-12"]
  },
  "connected_graph": {
    "related_projects_same_lab": [
      {"init": "JOP", "project_slug": "ringrepsca", "relation": "predecessor (Lee 2025 extension)"},
      {"init": "JYK", "project_slug": "dynamic_bias", "relation": "loss_function_overlap"},
      {"init": "SMJ", "project_slug": "concentricity", "relation": "uncertainty_concept_overlap"}
    ],
    "shared_paradigm_with": null
  },
  "timeline": [
    {"at": "2024-11-01", "event": "project initiated"},
    {"at": "2026-03-13", "event": "model_parameters frozen (per progress_summary)"},
    {"at": "2026-04-22", "event": "RingRepSca completed (sister project)"},
    {"at": "2026-05-14", "event": "Exp1 analysis deadline"}
  ],
  "external_refs": {
    "github": null,
    "notion": null,
    "obsidian": null,
    "research_note_pages": [],
    "lab_meeting_notes": []
  },
  "_meta": {
    "row_version": 1,
    "last_updated_at": "2026-05-13T15:00:00+09:00",
    "subagent_round": 2,
    "confidence_avg": 0.78,
    "fields_low_confidence": ["display.refresh_rate_hz", "n_trials_per_session"]
  }
}
```

### Field guidance

- **`_grounding`** appears in most blocks — pointer to evidence:
  - `nas:<path>` — NAS file (relative to NAS Memory root)
  - `nas:<path>:L<from>-L<to>` — specific lines
  - `nas_runs:<run_id>` — sub-sub agent output that surfaced this fact
  - `ledger:<INIT>_<HH:MM>_<YYYY-MM-DD>` — Slack message
  - `dm_log:<slack_ts>` — researcher reply
  - `github:<url>` / `notion:<url>` / `obsidian:<vault>:<path>`
- **`null`** = not yet known; **`[]`** = known to be empty; do not conflate
- **Confidence is implicit** — only solid facts (≥0.85 confidence at subagent
  write) appear in this row. Lower-confidence stays in subagent context.md
  working notes.

## 2. Researcher meta (`researchers.json`)

```json
{
  "JOP": {
    "name": "박준오",
    "role": "senior_researcher | active_cohort | junior | senior_anchor",
    "mentor_init": null,
    "active_projects": ["time2dist", "ringrepsca", "granrdt", "grannmds"],
    "dormant_projects": ["time", "uncertainty", "tdcs"],
    "primary_language": "MATLAB",
    "common_apparatus": "PsychToolbox",
    "common_modalities": ["behavior"],
    "interview_state": {
      "phase": "X of 6",
      "current_axis": "...",
      "silence_h": 1.5,
      "channels": {"dm": "D0AMRACTLBH", "audit": "C0B3FTHAVR8"}
    }
  },
  ...
}
```

## 3. Cross-researcher views (computed, not stored)

Phase 2+ retrieval will need indexes:

- **`by_apparatus.json`** — which projects use PsychoPy / PsychToolbox / jsPSych
- **`by_modality.json`** — fMRI vs eyetracker vs behavior-only buckets
- **`by_paradigm_family.json`** — orientation estimation / serial dependence / RDT / WM-distractor / categorization
- **`by_paper_citation.json`** — inverted index from prior-paper DOI → list of CSNL projects citing it

These are materialized views over `projects/<INIT>/*.json` and refreshed
weekly (proposed) or on-demand by the orchestrator.

## 4. Migration to Postgres (Phase 2)

When the JSON files stabilize (≥80% fields populated for ≥80% projects), migrate to:

```sql
CREATE TABLE csnl_v3.projects (
    init TEXT NOT NULL,
    project_slug TEXT NOT NULL,
    title TEXT,
    phase TEXT,
    purpose_jsonb JSONB,
    apparatus_jsonb JSONB,
    modalities_jsonb JSONB,
    experiment_design_jsonb JSONB,
    manipulation_variables_jsonb JSONB,
    code_artifacts_jsonb JSONB,
    data_artifacts_jsonb JSONB,
    timeline_jsonb JSONB,
    connected_graph_jsonb JSONB,
    external_refs_jsonb JSONB,
    _meta_jsonb JSONB,
    last_updated_at TIMESTAMPTZ,
    PRIMARY KEY (init, project_slug)
);

CREATE INDEX idx_projects_apparatus ON csnl_v3.projects ((apparatus_jsonb->>'stimulus_software'));
CREATE INDEX idx_projects_modalities ON csnl_v3.projects USING GIN (modalities_jsonb);
CREATE INDEX idx_projects_phase ON csnl_v3.projects (phase);

-- pgvector text representation for NL retrieval
CREATE TABLE csnl_v3.project_embeddings (
    init TEXT NOT NULL,
    project_slug TEXT NOT NULL,
    chunk_idx INT NOT NULL,
    chunk_text TEXT,
    embedding vector(1024),
    embed_model TEXT DEFAULT 'bge-m3',
    PRIMARY KEY (init, project_slug, chunk_idx),
    FOREIGN KEY (init, project_slug) REFERENCES csnl_v3.projects(init, project_slug)
);
```

## 5. Round-2 Opus subagent contract (next dispatch)

Each Opus subagent reads its `nas_runs/<UTC>_<UUID>_round2_comprehensive.jsonl`
+ existing `safe_memory.jsonl` and outputs `projects/<INIT>/<project_slug>.json`
rows under the above schema. Fields that cannot be filled stay `null`; the
subagent then drafts an interview Q (multiple choice / table format per
`subagent-hooks-2026-05-13.md`) to fill the gap on the next round.

End of schema spec.
