"""Export the tom-jev results that the interactive cells in the blog post use.

Reads the committed experiment-01 runs from a tom-jev checkout and writes one
JSON file with, for every scenario, the state Jev saw under each condition and
the distribution it returned. Run it with tom-jev importable:

    uv run --no-project --with-editable ../tom-jev python scripts/export_tom_jev.py ../tom-jev
"""

import json
import math
import sys
from pathlib import Path

from tom_jev import jev, representation, scenarios

CONDITIONS = ("sparse", "history", "rich")
# The stored development run predates the rename of its middle condition.
ALIASES = {"history_symbolic": "history"}
OUT = Path(__file__).resolve().parents[1] / "static/data/tom-jev/scenarios.json"


def load(path):
    return json.loads(path.read_text())


def export(root: Path) -> list[dict]:
    rows = []
    for split, suffix in (("dev", ""), ("test", "_test")):
        passes = {}
        for p in load(root / f"results/01_sparse_vs_rich{suffix}.json"):
            condition = ALIASES.get(p["condition"], p["condition"])
            passes.setdefault(p["scenario_id"], {})[condition] = p
        outcomes = {
            c["scenario_id"]: c
            for c in load(root / f"results/01_sparse_vs_rich_comparisons{suffix}.json")
        }
        for s in scenarios.load(root / "scenarios", split=split):
            question = {
                key: choice.model_dump(mode="json", exclude_none=True)
                for key, choice in jev.question_for(s).items()
            }
            outcome = outcomes[s.id]
            answers = {c: next(iter(passes[s.id][c]["answers"].values())) for c in CONDITIONS}
            probs = {c: answers[c]["probabilities"] for c in CONDITIONS}
            # The browser recomputes acceptable mass from these; make sure it agrees.
            mass = {c: sum(probs[c].get(a, 0.0) for a in outcome["acceptable"]) for c in probs}
            assert math.isclose(mass["sparse"], outcome["acceptable_mass_sparse"], abs_tol=1e-9)
            assert math.isclose(mass["rich"], outcome["acceptable_mass_rich"], abs_tol=1e-9)
            rows.append(
                {
                    "id": s.id,
                    "split": split,
                    "family": s.taxonomy.task_family,
                    "template": s.taxonomy.template,
                    "domain": s.taxonomy.domain,
                    "variant": s.taxonomy.condition,
                    "description": " ".join(s.description.split()),
                    "acceptable": outcome["acceptable"],
                    "question": question,
                    "states": {c: representation.render(s, c) for c in CONDITIONS},
                    "probs": probs,
                    "choice": {c: answers[c]["choice"] for c in CONDITIONS},
                    "model": passes[s.id]["rich"]["model"],
                }
            )
    return rows


if __name__ == "__main__":
    rows = export(Path(sys.argv[1]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, separators=(",", ":")) + "\n")
    print(f"wrote {len(rows)} scenarios to {OUT}")
