#!/usr/bin/env python3
"""Render Figure 3a (uncertainty stack) and Figure 3b (per-researcher radar)
for the csnl-ops README.

Source data:
  primary  : /tmp/csnl_readme/panel.json   (already computed by the harness)
  fallback : state/member_uncertainty.json + ledger.db  (last-resort recompute)

Outputs (150 dpi PNG, ~9x5 in):
  docs/figures/uncertainty_stack.png
  docs/figures/researcher_radar.png
"""

from __future__ import annotations

import json
import os
import sys
import warnings
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Patch

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------
REPO = Path(__file__).resolve().parents[2]
PRIMARY_PANEL = Path("/tmp/csnl_readme/panel.json")

# Fallback to live harness state (NAS-resident on the Mac Studio).
# HARNESS_ROOT can override for portability.
HARNESS_ROOT = Path(
    os.environ.get("HARNESS_ROOT", "/Users/csnl/csnl_on_ai/harness")
)
FALLBACK_UNC = HARNESS_ROOT / "state" / "member_uncertainty.json"
FALLBACK_LEDGER = HARNESS_ROOT / "state" / "ledger.db"
FALLBACK_TOPICS = HARNESS_ROOT / "state" / "researcher_topics.json"

OUT_DIR = REPO / "docs" / "figures"
STACK_PNG = OUT_DIR / "uncertainty_stack.png"
RADAR_PNG = OUT_DIR / "researcher_radar.png"

# Cohort + NAS chunk lookup. Move to a config file once these stop being stable.
COHORT = ["JOP", "BYL", "MSY", "SMJ", "JYK", "BHL", "SYJ"]
NAS_CHUNKS = {"JOP": 219, "BYL": 0, "MSY": 76, "SMJ": 0, "JYK": 1,
              "BHL": 0, "SYJ": 0}
NAS_FOLDER_EXISTS = {"JOP": True, "BYL": True, "MSY": True, "SMJ": True,
                     "JYK": True, "BHL": False, "SYJ": False}

# Brewer Set1 — colorblind-safer than tab:green/orange/red
CONFIRMED_COLOR = "#4daf4a"  # green
INFERRED_COLOR = "#ff7f00"   # orange
UNKNOWN_COLOR = "#e41a1c"    # red
UNKNOWN_HATCH = "//"         # redundancy for color-blind viewers

TITLE = "CSNL × AI Harness — Researcher Uncertainty Panel (2026-05-12 16:00 KST)"
FOOTER = (
    "U = (unknown + 0.5·inferred) / total.  "
    "Coverage = confirmed / total.  "
    "Q-rounds = min(inbound, outbound).  "
    "Source: ledger.db + member_uncertainty.json."
)

# Korean font preference list — matplotlib will pick the first available.
# axes.unicode_minus = False to avoid the minus-sign glyph fallback warning.
KOREAN_FONTS = [
    "AppleGothic",
    "Apple SD Gothic Neo",
    "Noto Sans CJK KR",
    "Noto Sans KR",
    "Nanum Gothic",
    "sans-serif",
]


# --------------------------------------------------------------------------
# Data loading
# --------------------------------------------------------------------------
def _dl(v: Any) -> int:
    if isinstance(v, (list, dict)):
        return len(v)
    return 0


def _compute_panel_from_live() -> list[dict[str, Any]]:
    """Recompute panel.json shape from live harness state.

    Reads member_uncertainty.json + researcher_topics.json + ledger.db.
    Assumes ledger received_at timestamps are KST naive (`+09:00` suffix
    optional). Falls through unknown shapes safely.
    """
    import sqlite3
    from datetime import datetime, timezone, timedelta

    KST = timezone(timedelta(hours=9))
    mu = json.loads(FALLBACK_UNC.read_text())
    rt: dict[str, Any] = {}
    if FALLBACK_TOPICS.exists():
        rt = json.loads(FALLBACK_TOPICS.read_text())
    db = sqlite3.connect(FALLBACK_LEDGER)
    db.row_factory = sqlite3.Row
    now = datetime.now(KST)

    panel: list[dict[str, Any]] = []
    for init in COHORT:
        st = mu.get(init, {}) if isinstance(mu.get(init), dict) else {}
        conf = _dl(st.get("confirmed"))
        inf = _dl(st.get("inferred"))
        unk = _dl(st.get("unknown"))
        total = max(conf + inf + unk, 1)
        u_score = (unk + 0.5 * inf) / total
        coverage = conf / total
        inb_row = db.execute(
            "SELECT COUNT(*) c, MAX(received_at) m "
            "FROM inbound_messages WHERE researcher_init=?",
            (init,),
        ).fetchone()
        out_row = db.execute(
            "SELECT COUNT(*) c FROM bot_outbound_messages WHERE member=?",
            (init,),
        ).fetchone()
        inb = int(inb_row["c"] or 0)
        outb = int(out_row["c"] or 0)
        silence_h: float | None = None
        if inb_row["m"]:
            s = inb_row["m"]
            try:
                if "+" in s or s.endswith("Z"):
                    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                else:
                    dt = datetime.fromisoformat(s).replace(tzinfo=KST)
                silence_h = round((now - dt).total_seconds() / 3600.0, 1)
            except Exception:
                silence_h = None
        topics = rt.get(init, {}).get("topics", []) if isinstance(rt.get(init), dict) else []
        p1_open = sum(
            1 for t in topics
            if str(t.get("priority")) == "1"
            and t.get("status") in ("open", "awaiting_deadline")
        )
        if silence_h is None:
            engagement = "never"
        elif silence_h < 24:
            engagement = "active"
        elif silence_h < 72:
            engagement = "cooling"
        else:
            engagement = "stale"
        panel.append({
            "init": init,
            "name": st.get("name", ""),
            "confirmed": conf,
            "inferred": inf,
            "unknown": unk,
            "total_facts": conf + inf + unk,
            "u_score": round(u_score, 3),
            "coverage": round(coverage, 3),
            "inbound": inb,
            "outbound": outb,
            "q_rounds": min(inb, outb),
            "nq_active": 1 if (st.get("next_question") or "").strip() else 0,
            "silence_h": silence_h if silence_h is not None else 0.0,
            "engagement": engagement,
            "topics_total": len(topics),
            "p1_open": p1_open,
            "nas_chunks": NAS_CHUNKS.get(init, 0),
            "nas_folder_exists": NAS_FOLDER_EXISTS.get(init, False),
            "last_inbound": inb_row["m"],
        })
    return panel


def load_panel() -> list[dict[str, Any]]:
    """Load the precomputed panel.json; otherwise recompute from live state."""
    if PRIMARY_PANEL.exists():
        with PRIMARY_PANEL.open() as fh:
            return json.load(fh)

    print(
        "\n!!! FALLBACK: /tmp/csnl_readme/panel.json missing — "
        f"recomputing panel from {HARNESS_ROOT}/state/. !!!\n",
        file=sys.stderr,
    )
    if not FALLBACK_UNC.exists():
        raise SystemExit(
            f"Neither {PRIMARY_PANEL} nor {FALLBACK_UNC} exists. "
            "Cannot render figures. Set HARNESS_ROOT env or stage panel.json."
        )
    panel = _compute_panel_from_live()
    # Cache the recomputed panel for next-render consistency.
    try:
        PRIMARY_PANEL.parent.mkdir(parents=True, exist_ok=True)
        PRIMARY_PANEL.write_text(json.dumps(panel, indent=2, default=str))
        print(f"INFO: cached recomputed panel to {PRIMARY_PANEL}.",
              file=sys.stderr)
    except OSError as exc:
        print(f"WARN: panel cache write failed: {exc}", file=sys.stderr)
    return panel


# --------------------------------------------------------------------------
# Font setup
# --------------------------------------------------------------------------
def configure_fonts() -> bool:
    """Configure matplotlib to use a Korean-capable font.

    Returns True if a Korean font was found, False if we fell back to
    English-only (caller should drop name labels in that case)."""
    from matplotlib import font_manager

    available = {f.name for f in font_manager.fontManager.ttflist}
    chosen = next((f for f in KOREAN_FONTS if f in available), None)
    if chosen is None:
        plt.rcParams["font.family"] = "sans-serif"
        plt.rcParams["axes.unicode_minus"] = False
        print("WARN: No Korean font found; Korean labels will be dropped.",
              file=sys.stderr)
        return False

    # Only list fonts that are actually installed; otherwise matplotlib
    # emits one `findfont` warning per glyph per missing font name.
    fallback_chain = [f for f in KOREAN_FONTS if f in available or f == "sans-serif"]
    plt.rcParams["font.family"] = fallback_chain
    plt.rcParams["axes.unicode_minus"] = False
    print(f"INFO: Using Korean font '{chosen}'.", file=sys.stderr)
    return True


# --------------------------------------------------------------------------
# Figure 3a — uncertainty stack
# --------------------------------------------------------------------------
def render_stack(panel: list[dict[str, Any]], has_korean: bool) -> None:
    inits = [r["init"] for r in panel]
    names = [r["name"] for r in panel]
    confirmed = np.array([r["confirmed"] for r in panel], dtype=float)
    inferred = np.array([r["inferred"] for r in panel], dtype=float)
    unknown = np.array([r["unknown"] for r in panel], dtype=float)
    totals = confirmed + inferred + unknown
    u_scores = [r["u_score"] for r in panel]

    fig, ax = plt.subplots(figsize=(9, 5))
    x = np.arange(len(inits))
    width = 0.62

    bars_c = ax.bar(x, confirmed, width, label="Confirmed",
                    color=CONFIRMED_COLOR, edgecolor="white", linewidth=0.6)
    bars_i = ax.bar(x, inferred, width, bottom=confirmed, label="Inferred",
                    color=INFERRED_COLOR, edgecolor="white", linewidth=0.6)
    bars_u = ax.bar(
        x, unknown, width, bottom=confirmed + inferred, label="Unknown",
        color=UNKNOWN_COLOR, edgecolor="white", linewidth=0.6,
        hatch=UNKNOWN_HATCH,
    )

    # Annotate U_score above each bar with generous padding so it never
    # collides with the top of the stack.
    y_top = totals.max()
    pad = max(0.6, y_top * 0.04)
    for xi, total, u in zip(x, totals, u_scores):
        ax.text(
            xi, total + pad, f"U={u:.2f}",
            ha="center", va="bottom", fontsize=9, fontweight="bold",
            color="#222",
        )

    # Headroom for the U-labels.
    ax.set_ylim(0, y_top + pad * 3.0)

    # Primary tick = INIT; secondary line = Korean name (or empty if
    # no Korean font was loaded). We embed both in one label using a
    # newline; rotate=0 because labels are short and we have only 7 bars.
    if has_korean:
        tick_labels = [f"{init}\n{name}" for init, name in zip(inits, names)]
    else:
        tick_labels = inits
    ax.set_xticks(x)
    ax.set_xticklabels(tick_labels, fontsize=10)

    ax.set_ylabel("Fact count")
    ax.set_xlabel("Researcher")
    ax.set_title(TITLE, fontsize=11, pad=12)
    ax.grid(axis="y", linestyle=":", linewidth=0.5, alpha=0.6)
    ax.set_axisbelow(True)

    # Legend OUTSIDE plot area so it never covers bars.
    legend_handles = [
        Patch(facecolor=CONFIRMED_COLOR, label="Confirmed"),
        Patch(facecolor=INFERRED_COLOR, label="Inferred"),
        Patch(facecolor=UNKNOWN_COLOR, hatch=UNKNOWN_HATCH, label="Unknown"),
    ]
    ax.legend(handles=legend_handles, bbox_to_anchor=(1.02, 1.0),
              loc="upper left", borderaxespad=0., frameon=False)

    fig.text(0.5, 0.01, FOOTER, ha="center", va="bottom",
             fontsize=8, color="#555")
    fig.subplots_adjust(right=0.82, bottom=0.18, top=0.90)

    fig.savefig(STACK_PNG, dpi=150, bbox_inches="tight")
    plt.close(fig)


# --------------------------------------------------------------------------
# Figure 3b — per-researcher radar
# --------------------------------------------------------------------------
def render_radar(panel: list[dict[str, Any]], has_korean: bool) -> None:
    # 4 normalized axes:
    #   1 - U_score   (higher = better)
    #   Coverage     (already 0..1)
    #   Q-rounds     (normalized by global max)
    #   Engagement   (active=1, cooling=0.5, stale=0)
    axes_labels = ["1 - U", "Coverage", "Q-rounds", "Engagement"]
    eng_map = {"active": 1.0, "cooling": 0.5, "stale": 0.0}

    q_max = max((r["q_rounds"] for r in panel), default=1) or 1
    angles = np.linspace(0, 2 * np.pi, len(axes_labels), endpoint=False).tolist()
    angles += angles[:1]  # close the polygon

    # Constrained_layout keeps the suptitle clear of the radar titles
    # and prevents the per-axis tick labels from overlapping neighbours.
    fig, axarr = plt.subplots(
        2, 4, figsize=(11, 6), subplot_kw=dict(polar=True),
        constrained_layout=True,
    )
    axarr = axarr.flatten()

    for idx, row in enumerate(panel):
        ax = axarr[idx]
        vals = [
            max(0.0, 1.0 - float(row["u_score"])),
            float(row["coverage"]),
            float(row["q_rounds"]) / float(q_max),
            eng_map.get(row["engagement"], 0.0),
        ]
        vals += vals[:1]

        ax.plot(angles, vals, color="#377eb8", linewidth=1.4)
        ax.fill(angles, vals, color="#377eb8", alpha=0.25)

        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(axes_labels, fontsize=7.5)
        ax.set_yticks([0.25, 0.5, 0.75, 1.0])
        ax.set_yticklabels([])  # declutter
        ax.set_ylim(0, 1.0)
        ax.tick_params(axis="x", pad=2)

        if has_korean and row["name"]:
            title = f"{row['init']}  {row['name']}"
        else:
            title = row["init"]
        ax.set_title(title, fontsize=10, pad=10)

    # Last cell blank — hide spines.
    axarr[-1].axis("off")

    fig.suptitle(TITLE, fontsize=11)
    fig.supxlabel(FOOTER, fontsize=7.5, color="#555")

    # bbox_inches='tight' alone fights constrained_layout; let CL do its job.
    fig.savefig(RADAR_PNG, dpi=150)
    plt.close(fig)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    panel = load_panel()
    has_korean = configure_fonts()

    # Silence the harmless "Glyph missing" warning that fires once for any
    # CJK char matplotlib has to fall back on — we already chose a Korean
    # font when one was present.
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=UserWarning,
                                 module="matplotlib")
        render_stack(panel, has_korean)
        render_radar(panel, has_korean)

    for p in (STACK_PNG, RADAR_PNG):
        sz = p.stat().st_size if p.exists() else 0
        print(f"wrote {p} ({sz} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
