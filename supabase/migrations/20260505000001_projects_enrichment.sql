-- =============================================================================
-- Migration: 20260505000001_projects_enrichment.sql
-- Purpose  : Enrich csnl_ops.projects with full_name and software[] for each
--            of the 15 seeded projects.
--
-- Audit trail — source per project
--   Passive_navigation        : Memory/JSL/Passive_navigation/Code/ (.py files, no psychopy import)
--   SerialDep_Spatial         : Memory/JSL/SerialDep_Spatial/Code/ExpCode_eyetracker/ (.m file confirmed)
--                               + csnl_meta_knowledge.md §JSL
--   RingRepSca                : Memory/JOP/RingRepSca/README.md + Code/BDM_Magnitude/ (.m files)
--   Time                      : Memory/JOP/Time/README.md + Code/time/ (.m files)
--   Time2Dist                 : Memory/JOP/Time2Dist/README.md + Code/Experiment/ (.m files)
--   GranNMDS                  : Memory/JOP/GranNMDS/README.md + Code/Psyspace_Shepard.m (.m)
--   GranRDT                   : Memory/JOP/GranRDT/README.md + Code/ (.m files)
--   tDCS                      : Memory/JOP/tDCS/Code/tDCS_Bhv_Detect/ (.m files); no Context README
--                               + csnl_meta_knowledge.md key publication: Ahn et al. (2023, Brain Stim)
--   Uncertainty               : Memory/JOP/Uncertainty/README.md + Code/ (empty — analysis only)
--                               full_name inferred from README; software NULL (no code found)
--   biasVar                   : Memory/BYL/biasVar/BYL_README.json + Code/Experiment/260218_main/ (.m)
--   RNN                       : Memory/JYK/RNN/Code/RNN/ (.ipynb files → python)
--                               + csnl_meta_knowledge.md §JYK
--   CatVsMag                  : Memory/MSY/Code/cat_mag_main/cat_mag_main_ses1/ (.psyexp + .js → psychopy)
--                               + csnl_meta_knowledge.md §MSY
--   Concentricity             : Memory/SMJ/Concentricity/Code/run_experiment_0203.py → psychopy import confirmed
--                               + csnl_meta_knowledge.md §SMJ
--   Screen_Retinotopy         : Memory/SK/Screen_Retinotopy/Code/ (.m files)
--   WMRepresentation_24_updated: Memory/SK/WMRepresentation_24_updated/Code/ (.m files)
--                                + csnl_meta_knowledge.md §SK
--
-- NULL decisions
--   tDCS (software): Code dir has .m files but context/README is absent. Software = {'ptb'}
--                    inferred from Ahn et al. (2023, Brain Stim) EVC paradigm + .m code.
--   Uncertainty (software): Code dir was empty at time of scan; analysis done in external tools.
--                           Set to empty array rather than guessing.
--
-- Idempotency : UPDATE is idempotent; re-running sets same values.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- JSL projects (2)
-- ---------------------------------------------------------------------------

-- Passive_navigation: .py analysis scripts (no psychopy import — fMRI analysis pipeline)
update csnl_ops.projects
   set full_name = 'Passive Navigation fMRI: Hippocampal & Cortical Mapping',
       software  = array['python']
 where code = 'Passive_navigation';

-- SerialDep_Spatial: experiment code = mainExp_v5.m → ptb; analysis = .ipynb → python
update csnl_ops.projects
   set full_name = 'Serial Dependence in Spatial Reference Frames',
       software  = array['ptb', 'python']
 where code = 'SerialDep_Spatial';

-- ---------------------------------------------------------------------------
-- JOP projects (7)
-- ---------------------------------------------------------------------------

-- RingRepSca: README + Code/BDM_Magnitude/*.m → ptb (Psychophysics Toolbox)
update csnl_ops.projects
   set full_name = 'Ring Reproduction & Scaling: History Effect in Estimation without Decision Commitment',
       software  = array['ptb']
 where code = 'RingRepSca';

-- Time: README + Code/time/*.m → ptb
update csnl_ops.projects
   set full_name = 'Duration Perception History Effect: Domain-General Serial Dependence',
       software  = array['ptb']
 where code = 'Time';

-- Time2Dist: README + Code/Experiment/main_duration.m → ptb
update csnl_ops.projects
   set full_name = 'Duration Perception Distribution Learning: CDF vs Point Estimate Mapping',
       software  = array['ptb']
 where code = 'Time2Dist';

-- GranNMDS: README + Code/Psyspace_Shepard.m → matlab (analysis only, no exp code)
update csnl_ops.projects
   set full_name = 'Granularity Effect Analysis via Non-metric MDS & Shepardian Distance',
       software  = array['matlab']
 where code = 'GranNMDS';

-- GranRDT: README + Code/*.m (BlahutMICD.m, CostFunFit.m, etc.) → matlab
update csnl_ops.projects
   set full_name = 'Granularity Effect Analysis via Rate-Distortion Theory',
       software  = array['matlab']
 where code = 'GranRDT';

-- tDCS: Code/tDCS_Bhv_Detect/*.m → ptb; no README, name from Ahn et al. (2023)
update csnl_ops.projects
   set full_name = 'tDCS Sharpening of EVC Spatial Tuning: Behavioral Detection Task',
       software  = array['ptb']
 where code = 'tDCS';

-- Uncertainty: README confirmed; Code/ dir empty → software left as empty array
update csnl_ops.projects
   set full_name = 'Posterior Uncertainty in Estimation: Betting-Range Measurement',
       software  = array[]::text[]
 where code = 'Uncertainty';

-- ---------------------------------------------------------------------------
-- BYL projects (1)
-- ---------------------------------------------------------------------------

-- biasVar: BYL_README.json + Code/Experiment/260218_main/*.m → ptb
update csnl_ops.projects
   set full_name = 'Bias-Variability Trade-off in Orientation Working Memory',
       software  = array['ptb']
 where code = 'biasVar';

-- ---------------------------------------------------------------------------
-- JYK projects (1)
-- ---------------------------------------------------------------------------

-- RNN: Code/RNN/*.ipynb → python; meta_knowledge confirms drift-diffusion RNN modeling
update csnl_ops.projects
   set full_name = 'RNN Modeling of Stimulus-Specific and Decision-Consistent Biases in Working Memory',
       software  = array['python']
 where code = 'RNN';

-- ---------------------------------------------------------------------------
-- MSY projects (1)
-- ---------------------------------------------------------------------------

-- CatVsMag: Code/cat_mag_main/ has .psyexp + PsychoPy JS output (psychojs-2025.2.3.css in index.html)
--           Primary tool = psychopy (builder + online runner)
update csnl_ops.projects
   set full_name = 'Categorical vs Magnitude Serial Dependence in Face Gender Perception',
       software  = array['psychopy']
 where code = 'CatVsMag';

-- ---------------------------------------------------------------------------
-- SMJ projects (1)
-- ---------------------------------------------------------------------------

-- Concentricity: run_experiment_0203.py confirmed: `from psychopy import visual, core, event ...`
--                analysis_code/*.py → plain python
update csnl_ops.projects
   set full_name = 'Concentricity as Oculomotor Prior: Image Memory and Saccadic Strategy',
       software  = array['psychopy', 'python']
 where code = 'Concentricity';

-- ---------------------------------------------------------------------------
-- SK projects (2)
-- ---------------------------------------------------------------------------

-- Screen_Retinotopy: Code/ has runRetinotopy.m, runHIRF.m, loadDisplays.m → ptb
update csnl_ops.projects
   set full_name = 'Screen-Based Population Receptive Field Mapping (Retinotopy)',
       software  = array['ptb']
 where code = 'Screen_Retinotopy';

-- WMRepresentation_24_updated: Code/Fig*/*.m throughout → matlab
--   meta_knowledge: 50-subject fMRI, dPCA, cross-generalization, EVC sensory-memory dissociation
update csnl_ops.projects
   set full_name = 'EVC Working Memory Representation: Orthogonal Sensory and Mnemonic Codes (fMRI)',
       software  = array['matlab']
 where code = 'WMRepresentation_24_updated';

-- =============================================================================
-- Summary of updates
--   15 projects updated
--   full_name: 15/15 filled (0 NULLs)
--   software:  14/15 filled; Uncertainty = array[] (empty — no code found in Code/)
--
--   Software breakdown:
--     ptb    : SerialDep_Spatial (partial), RingRepSca, Time, Time2Dist, tDCS, biasVar, Screen_Retinotopy
--     matlab : GranNMDS, GranRDT, WMRepresentation_24_updated
--     python : Passive_navigation, SerialDep_Spatial (partial), RNN
--     psychopy: CatVsMag, Concentricity
--     empty  : Uncertainty
-- =============================================================================

commit;
