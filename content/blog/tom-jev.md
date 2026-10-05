---
title: "Knowing When to Re-Represent"
date: "2026-10-01"
mathjax: "true"
marimo-version: 0.25.1
---

## An old idea I've been wanting to revisit

A few years ago, CJ McFate and I wrote [a paper](https://doi.org/10.1007/978-3-031-21671-8_9)[^1] about System 1 vs System 2 in theory of mind reasoning. For the unfamiliar, System 1 and System 2 come from a long tradition of dual-process theories of cognition, but the terminology was popularized by Daniel Kahneman in his 2011 book *Thinking, Fast and Slow*. As the title implies, the basic idea is that we have two modes of thinking: System 1 is fast, automatic, and efficient, while System 2 is slower and more deliberate. If this all sounds familiar due to the recent release of *System 1 models* in AI, you're onto something. We'll come back to those.

Various cognitive science researchers have argued that the System 1/System 2 distinction applies to many kinds of reasoning, including one near and dear to my heart—theory of mind. The argument goes that efficient theory of mind is fast but representationally constrained, whereas effortful theory of mind supports richer reasoning about beliefs and other mental states. 

In our paper, CJ and I argued that this process may not actually require two different reasoning systems. Instead, it could arise via re-representation: start by reasoning over a relatively sparse representation, and when that representation proves inadequate, reconstruct the problem with explicit mental states.

At the time, we implemented this idea in AToM, an analogical cognitive model that I developed as part of my dissertation work. But recently I started wondering what this hypothesis would look like in the context of modern AI systems. 

Enter System 1 models.

## What does re-representation mean for a modern AI system?
The specific model that caught my attention is [TypeSafe AI](https://typesafe.ai)'s [Jev](https://docs.typesafe.ai). Jev is a *decision model* whose major contribution is relatively cheap inference from a supplied state representation. Unlike LLMs, which return open text, Jev's output is a probability distribution over a provided set of choices. As a nice side effect, this means can't generate an answer outside those provided choices, but, more importantly for our purposes, we can use it to test the representation hypothesis CJ and I proposed: how does Jev's theory of mind-like reasoning change as we vary the richness of representation we provide?

I would like to pause here for a second to clarify: while Jev is a System 1 model, it is not a (cognitive) model of System 1 reasoning. This matters to the cognitive scientist in me, but doesn't have much bearing on the experiment. The real question doesn't actually have much to do with System 1 vs. System 2, as much as with the power of representation. In other words, **Can the same model make better predictions about an agent simply because we've done more work to represent what that agent believes? And, if so, can we tell when doing that extra work will actually be useful?**

Consider the following scenario:

> A report was originally in the office.\
> Sam saw it there.\
> The report was later moved to the conference room while Sam wasn't there.\
> Sam wants the report.\
> Where will Sam go?

The answer may seem obvious—to the office, of course. But notice how much work is hiding inside that answer. We know the report is actually in the conference room. We also know that Sam last saw it in the office and didn't see it move. From those facts, we construct another fact that isn't explicitly stated: Sam believes the report is still in the office. We then use that belief, rather than the true location of the report, to predict what Sam will do.

But how much of that needs to be represented explicitly for Jev?

At one extreme, we could give it a relatively sparse representation: the current state of the world, what Sam wants, and the observation we're asking it to reason about. At the other, we could do the representational work ourselves and explicitly tell it that Sam believes the report is in the office.

And there's an interesting point in between: we could tell it what Sam did and didn't observe—the evidence from which his belief follows—without ever stating the belief itself.

That gives us three versions of the same underlying situation:

- **Sparse**: observations + world state + goals
- **History**: sparse + the events describing what the agent had epistemic access to
- **Rich**: sparse + an explicit representation of the agent's belief

The model is the same in all three cases. The underlying situation is the same. What changes is how much work has already been done to represent the agent's mental state.

*The figures in this post are interactive: they run Python in your browser, so they can take a few seconds to appear.*

```python {.marimo hide_code="true"}
import json
import sys

import altair as alt
import marimo as mo

LABELS = {"sparse": "Sparse", "history": "History", "rich": "Rich"}
# The site's palette: grey to red as the representation gets richer, and in
# answer charts, reds for acceptable answers and greys for the rest.
COLORS = ["#9aa0a6", "#f19a9b", "#e22d30"]
REDS = ["#e22d30", "#f0787a", "#f8b4b5"]
GREYS = ["#5f6368", "#80868b", "#9aa0a6", "#c4c8cc"]


async def load_json(path):
    if sys.platform == "emscripten":  # running in the browser
        import js
        from pyodide.http import pyfetch

        # Python runs in a worker whose blob: URL carries this site's origin.
        return await (await pyfetch(f"{js.location.origin}/{path}")).json()
    from pathlib import Path

    return json.loads((mo.notebook_dir() / "../../static" / path).read_text())


# Every scenario from github.com/irabkina/tom-jev: the state Jev saw under
# each representation, and the distribution it returned.
scenarios = {}
for _s in await load_json("data/tom-jev/scenarios.json"):
    _s["mass"] = {c: sum(p.get(a, 0) for a in _s["acceptable"]) for c, p in _s["probs"].items()}
    scenarios[_s["id"]] = _s


def answer_label(s, option):
    return option.replace("_", " ") + (" ✓" if option in s["acceptable"] else "")


def choice_order(s):
    """Acceptable answers first, so the red part of a bar starts at 0%."""
    options = list(next(iter(s["question"].values()))["criteria"])
    return sorted(options, key=lambda o: o not in s["acceptable"])


def choice_scale(s):
    order = choice_order(s)
    good = sum(o in s["acceptable"] for o in order)
    return alt.Scale(
        domain=[answer_label(s, o) for o in order],
        range=REDS[:good] + GREYS[: len(order) - good],
    )


def answers_chart(s, conditions=tuple(LABELS)):
    order = choice_order(s)
    rows = [
        {
            "representation": LABELS[c],
            "choice": answer_label(s, a),
            "rank": order.index(a),
            "probability": v,
        }
        for c in conditions
        for a, v in s["probs"][c].items()
    ]
    return (
        alt.Chart(alt.Data(values=rows))
        .mark_bar()
        .encode(
            x=alt.X(
                "probability:Q",
                stack="normalize",
                title="Jev's probability for each choice",
                axis=alt.Axis(format="%"),
            ),
            y=alt.Y("representation:N", sort=[LABELS[c] for c in conditions], title=None),
            color=alt.Color(
                "choice:N",
                title="Choice",
                scale=choice_scale(s),
                legend=alt.Legend(orient="bottom", columns=1),
            ),
            order=alt.Order("rank:Q"),
            tooltip=["representation:N", "choice:N", alt.Tooltip("probability:Q", format=".0%")],
        )
        .properties(width="container", height=34 * len(conditions), background="transparent")
    )


def state_text(state):
    return "\n\n".join(
        f"{section}:\n" + "\n".join("  " + line for line in text.splitlines())
        for section, text in state.items()
    )
```

Here is exactly what Jev sees for Sam under each representation (switch between the tabs), and the probability it puts on each choice.

```python {.marimo hide_code="true"}
_sam = scenarios["report_false_positive"]
_question = next(iter(_sam["question"].values()))
mo.vstack(
    [
        mo.ui.tabs(
            {LABELS[c]: mo.md(f"```text\n{state_text(_sam['states'][c])}\n```") for c in LABELS}
        ),
        mo.md(
            f"Jev is asked `{_question['instructions']}` and chooses between "
            + " and ".join(answer_label(_sam, o) for o in _question["criteria"])
            + ". The ✓ marks the answer that follows from Sam's belief."
        ),
        answers_chart(_sam),
    ]
)
```

That gives us a fairly direct way to test the original re-representation hypothesis: what changes when we make the representation richer while holding the reasoner fixed? 

To make this differentiation clear, the three representations are deliberately matched. Sparse describes the scenario, history adds enough information to *entail* the necessary beliefs, and rich represents them outright. 

Moreover, because Jev gives us a probability distribution rather than a single answer, we don't have to reduce our analysis to whether it got a question "right." We can measure how the distribution changes as we add representational structure. Does probability move toward the answer implied by Sam's belief? Does the model become more or less certain? Does adding the richer representation actually change its preferred answer?

My hypothesis, following from the one in the 2023 paper, was straightforward: richer representations should matter particularly when the agent's representation of the world diverges from reality. So I gave Jev the same scenarios at different levels of representational richness and measured what changed.

The results were much more interesting than I expected.

## Do richer representations actually help?

Spoiler: they do.

|                              | **Sparse** | **Rich** |
|------------------------------|-----------:|---------:|
| Mean acceptable mass         | 0.51       | 0.87     |
| Scenarios answered correctly | 35 / 68    | 63 / 68  |

“Acceptable mass” is the probability Jev assigns to acceptable answers. Moving from the sparse to the rich representation corrected 28 of 68 scenarios, with zero regressions. The remaining 40 scenarios were unchanged: 35 stayed correct and 5 stayed incorrect.

"But Irina, you gave it more data. Of course it performed better."

That's a fair point. We would, then, expect history to give a similar improvement.

| **Representation** | **Mean acceptable mass** |
|---|---:|
| Sparse | 0.51 |
| History | 0.57 |
| Rich | 0.87 |

tl;dr: Giving Jev the evidence from which a belief follows helps, but it doesn't produce the same result as explicitly representing the belief.

There's an important caveat to that 0.57: some of the apparent history-to-rich gap turned out to come from an equal-length control I added to the history condition, rather than from the representation itself. I'll come back to that. But even after accounting for it, history doesn't close the gap.

This distinction matters. If rich simply beat sparse, we couldn't say much about re-representation: rich contains more relevant information, and more relevant information might simply produce better predictions. But history gives Jev the information needed to derive the same belief without actually representing that belief. The fact that history improves on sparse but still falls short of rich is evidence that what matters isn't simply having the relevant information available to the system. It also matters whether the belief itself has been made available directly.

Here is every development scenario, one row each, with a dot for each representation. Rows are sorted by how much the rich representation helped. Hover over a row for the scenario.

```python {.marimo hide_code="true"}
family = mo.ui.radio(
    {"Action prediction (40)": "action_prediction", "Goal recognition (28)": "goal_recognition"},
    value="Action prediction (40)",
    inline=True,
)
family
```

```python {.marimo hide_code="true"}
# Discriminative goal-recognition variants say which goal the agent believes
# is where they're walking, e.g. false_false: only the goal that isn't there.
GOAL_BELIEFS = {
    "true_true": "right goal",
    "false_false": "wrong goal",
    "false_true": "both goals",
    "true_false": "neither goal",
}


def _label(s):
    wording = " v2" if "_v2_" in s["id"] else ""
    condition = GOAL_BELIEFS.get(s["variant"], s["variant"].replace("_", " "))
    return f"{s['domain'].replace('_', ' ')}{wording} · {condition}"


_dev = sorted(
    (s for s in scenarios.values() if s["split"] == "dev" and s["family"] == family.value),
    key=lambda s: (s["mass"]["rich"] - s["mass"]["sparse"], s["mass"]["rich"]),
    reverse=True,
)
_order = [_label(s) for s in _dev]
# Narrow screens get shorter row labels; hover shows the full scenario. The
# label column is the same width for both families, so the plot doesn't
# shift when the radio buttons switch between them.
_label_width = alt.ExprRef("containerSize()[0] < 500 ? 110 : 200")
_y = alt.Y(
    "scenario:N",
    sort=_order,
    title=None,
    axis=alt.Axis(
        labelLimit=_label_width,
        minExtent=_label_width,
        maxExtent=_label_width,
        ticks=False,
    ),
)
alt.layer(
    # Shade every other row so each scenario's three dots read as a group.
    alt.Chart(alt.Data(values=[{"scenario": label} for label in _order[::2]]))
    .mark_rect(color="#9aa0a6", opacity=0.12)
    .encode(y=_y),
    alt.Chart(
        alt.Data(
            values=[
                {
                    "scenario": _label(s),
                    "story": s["description"],
                    "representation": LABELS[c],
                    "acceptable": s["mass"][c],
                }
                for s in _dev
                for c in LABELS
            ]
        )
    )
    .mark_point(filled=True, size=40, opacity=1)
    .encode(
        x=alt.X(
            "acceptable:Q",
            title="Probability Jev puts on the acceptable answer",
            scale=alt.Scale(domain=[0, 1]),
            # On narrow screens the title is wider than the plot, so end it at
            # the plot's right edge and let it run under the row labels.
            axis=alt.Axis(
                format="%",
                tickCount=5,
                titleAnchor=alt.ExprRef("containerSize()[0] < 500 ? 'end' : 'middle'"),
            ),
        ),
        y=_y,
        yOffset=alt.YOffset("representation:N", sort=list(LABELS.values())),
        color=alt.Color(
            "representation:N",
            sort=list(LABELS.values()),
            scale=alt.Scale(domain=list(LABELS.values()), range=COLORS),
            legend=alt.Legend(orient="top", title=None, columns=3),
        ),
        tooltip=["story:N", "representation:N", alt.Tooltip("acceptable:Q", format=".0%")],
    ),
).properties(width="container", height=18 * len(_dev), background="transparent")
```

So, it seems that doing more work to represent an agent's mental state can substantially improve the predictions made by the same underlying model. But there's an obvious problem with simply giving Jev the rich representation every time: if we're going to do the expensive representational work for every inference anyway, we've lost much of the motivation for having a cheap reasoner in the first place.

The more interesting question, then, is whether we can tell **when** that extra work is worth doing.

## How do we know when to re-represent?

In an ideal world, there would be a quick, cheap way to check whether the effort of re-representation is worthwhile. We could, of course, just construct the rich representation every time and compare directly, but that defeats the purpose. Once you've done the re-representation work, you might as well just do the inference. Jev inference, after all, is famously (relatively) cheap. Instead, we want to predict the value of information that hasn't been represented yet.

My development corpus had two types of task families: goal recognition (i.e., what does the agent want to do?) and action prediction (i.e., what is the agent going to do next?). When separating the results by scenario type, I found an interesting pattern.


|                         | **Action prediction** | **Goal recognition** | **Total** |
|-------------------------|----------------------:|---------------------:|----------:|
| Scenarios               | 40                    | 28                   | 68        |
| Correct, sparse         | 17                    | 18                   | 35        |
| Correct, rich           | 40                    | 23                   | 63        |
| Corrections             | 23                    | 5                    | 28        |
| Correction rate         | 58%                   | 18%                   | 41%       |

It appears as though rich helped the action prediction scenarios much more than the goal recognition ones. This suggested a plausible explanation: maybe predicting an agent's next action depends more heavily on having the agent's belief represented directly, whereas goal recognition is less sensitive to it. Maybe it really is as easy as re-representing for action prediction, and saving the compute for goal recognition.

But I wanted to know why.

Digging into the development dataset, I realized that the belief representation plays different roles across scenarios. Sometimes, it's *discriminative* and gives a concrete alternative. Sam believes the report is in the office, contrary to what reality says. Other times, it's *inhibitory*. Sam doesn't believe the coffee is in the kitchen... but the representation doesn't establish what Sam actually does believe.

This observation led to an intuition: **Re-representation needs somewhere to go.** A richer representation that supplies a competing interpretation can move probability onto that interpretation, but one that undermines the current interpretation without providing an alternative may only spread probability around. Maybe task family wasn't the important distinction at all.

Is this something that we can predict from the contents of the sparse representation? Are these scenarios different enough to be discriminated without seeing the belief representation itself?

Short answer: No.

I explored a variety of potential signals:
- Is Jev's inference from the sparse representation less certain when the belief is most relevant?
- Is the correct answer contradicted by something in the scenario or the world?
- Is there something unique about the probability distributions of the inferences for these scenarios?
- Does the sparse inference disagree with some cheap alternative inference we could run?

No, no, no... and no.

It turns out, Jev is quite confident in its inferences even when a richer representation would help. And reasonably so—given the contents of the sparse representation, there isn't really any reason to suspect that something might be amiss. That's exactly the problem we're trying to solve: the sparse representation contains no indication that the missing belief would change the answer.

Ok, so maybe it's something structural about the scenarios or the questions themselves. I was already playing around with Neo4j for storage, so a dependency graph was an easy test: does answering the question require knowing someone's mental state?

Short answer: Yes.

For every single scenario. It turns out that every prediction about an agent depends on that agent's internal representation. Go figure. "Always re-represent" has 0.41 precision and 1.0 recall on the dataset. But that's not very satisfying (and requires always doing the costly re-representation work).

At this point, I realized that I was making a flawed assumption: that there is something wrong with the sparse representation or the model's treatment of it. And that's the rub. The representation isn't incorrect. Jev isn't doing anything unexpected with it. Given an impoverished, but accurate, representation, it's making the reasonable inference. 

In retrospect, maybe this shouldn't have been surprising. The entire experimental manipulation was withholding the information that would change Jev's answer. Why should I expect Jev's output to reliably tell me that information it couldn't see would have changed its mind?

So if nothing in the sparse representation or Jev's reasoning based on it can identify that re-representation would be helpful, maybe we need to step back and look for a different signal. In fact, what if, instead of asking the sparse representation to diagnose its own inadequacy, we make a smaller representational intervention and watch what happens?

## A small intervention as a signal

We've already looked at history as an intermediate(ish) representation between sparse and rich. Recall that it gives enough additional information to deduce the agent's belief, without representing it outright. Think, "Sam wasn't in the room when the report was moved to the conference room" vs. "Sam thinks the report is in the office." But what if history isn't just a useful intermediate? What if Jev's response to it can tell us whether the full, rich representation is worth the effort?

This actually follows nicely from my original paper. There, we proposed that something about the scenario tells human reasoners whether it's worth re-representing; it's the "Wait a second! Sam wasn't there!" moment. That's exactly what history gives us, potentially making it a useful signal for the model, too.

Testing this hypothesis didn't require any new computations. I already had Jev's probability distributions computed for all three representations, so it was mostly a matter of analyzing the relationships between them. There were a few possibilities:
- Did the answer with the highest probability change?
- How much did the distributions move overall?
- Did adding epistemic histories make Jev more or less certain than it was before?

That last one ended up being especially fruitful: when history made Jev's prediction less certain, providing the rich representation was disproportionately likely to help. Or, more formally, \\(H(history) > H(sparse) \Rightarrow \text{re-represent}\\).

Here, \\(H\\) is entropy—a measure of how spread out Jev's probability distribution is. Higher entropy means its probability mass is spread more evenly across the choices; lower entropy means it's more concentrated on one or a few answers. If adding the epistemic history increases entropy, it has, by definition, made the model less certain. And, it turns out, any amount of increased uncertainty from the addition of history is a pretty good signal that representing the belief directly will push the probability mass in the right direction.

Think of it like this: Jev has a coherent interpretation of the world based on the sparse representation. We add more information in the form of history. Sometimes, nothing changes—perhaps the history is consistent with the original interpretation. But sometimes, the history destabilizes the interpretation. Jev becomes less sure of its answer, even though history hasn't directly supplied the mental state needed to resolve the ambiguity. Supplying it via the rich representation, then, substantially moves the needle.

Sparse couldn't tell us what it didn't know. History doesn't necessarily solve the problem either—but it can reveal that there is a problem. Rich can then come in to save the day. 

On the development corpus, that looks like this:

| Policy                   | Escalation rate | Available gain recovered |
| ------------------------ | --------------: | -----------------------: |
| `H(history) > H(sparse)` |             63% |                      80% |
| Never materialize        |              0% |                       0% |
| Always materialize       |            100% |                     100% |

“Available gain” is just the improvement we'd get by always using rich. The entropy policy got about 80% of that benefit while escalating only 63% of scenarios. That's not nothing!

This looked great. But there was a pretty big problem: I'd spent the previous several experiments poking at exactly these 68 scenarios trying to find something that worked. I couldn't honestly treat 63% → 80% as evidence that I'd discovered a general escalation policy. At this point, it was a hypothesis generated from the development data. Plus, there was still that pesky task family baseline to deal with. It recovered 87% of available gain at an escalation rate of 59%. I didn't bother to check whether that difference was significant, but it sure looked like task family escalation was better than the entropy-based policy. It certainly wasn't worse.

But recall that I already had reason to be suspicious of the task-family explanation. When I dug into why action prediction seemed to benefit so much more from re-representation, I found another difference hiding underneath it: what the belief actually *did*. The action-prediction scenarios tended to give Jev a concrete alternative interpretation, while many of the goal-recognition scenarios merely undermined the existing one.

In other words, my development corpus had accidentally tangled together two different variables: **task family** and **representational function**. Was action prediction really special, or did it just happen to contain more scenarios where the richer representation gave Jev somewhere useful to go? There was no way to answer that question with the same 68 scenarios. I needed new data—and this time, I needed to make sure the two variables weren't confounded.

So I generated a new set of 32 scenarios that deliberately crossed the two dimensions:

|                       | Discriminative | Inhibitory |
| --------------------- | -------------- | ---------- |
| **Action prediction** | 8              | 8          |
| **Goal recognition**  | 8              | 8          |

As before, discriminative here means that the belief is sufficient for identifying one choice. Inhibitory means that it only points away from some of them. 

Two held-out scenarios show the difference. In both, the agent holds a false belief and Jev must predict what they'll do. Rasheed's belief names where he'll go instead; Bijan's only rules a place out.

```python {.marimo hide_code="true"}
belief = mo.ui.radio(
    {
        "Discriminative (Rasheed)": ("loading_gate_false_negative", "Discriminative"),
        "Inhibitory (Bijan)": ("ward_round_false_negative", "Inhibitory"),
    },
    value="Discriminative (Rasheed)",
    inline=True,
)
belief
```

```python {.marimo hide_code="true"}
_sid, _heading = belief.value
_s = scenarios[_sid]
mo.vstack(
    [
        mo.md(f"**{_heading}.** {_s['description'].split('. ')[0]}."),
        mo.md("The rich representation adds:\n\n```text\n" + _s["states"]["rich"]["mental_state"] + "\n```"),
        answers_chart(_s, ("sparse", "rich")),
    ]
)
```

Importantly, I also froze my escalation policy at this point. No more tweaking thresholds or testing other policies. I then generated the 32 new scenarios without running Jev on them.

That means the first run on this new corpus was a true out-of-sample test: the policy hadn't been selected on these scenarios, and the scenarios hadn't been designed in response to its performance. That's important for the science of it all.

## The big reveal

It worked! Almost suspiciously well.

| Policy | Held-out | Development |
|---|---:|---:|
| **H(history) > H(sparse)** | **62% esc. → 81% recovery** | **63% esc. → 80% recovery** |
| Never materialize | 0% → 0% | 0% → 0% |
| Always materialize | 100% → 100% | 100% → 100% |
| Task family | 50% → 57% | 59% → 87% |

On a set of scenarios that didn't exist when I chose the policy, the entropy trigger escalated almost exactly as often and recovered almost exactly the same fraction of the available benefit as on the development corpus. Where always re-representing gives 100% of potential improvement, and never re-representing gives you none, the entropy-based escalation policy constructed a rich representation for 20/32 scenarios (62%) and, in doing so, recovered 81% of the acceptable mass movement that always using the rich representation would have provided. In other words, the trigger skipped more than a third of the rich passes while retaining about four-fifths of their measured benefit.

And what about task family? As we suspected, action prediction wasn't what explained the effect. On the held-out dataset, triggering based on task family escalated 50% of cases and recovered 57% of available gain. It seems that what looked like a task family effect was largely a property of how the development corpus had been constructed.

| Held-out cell | Never re-represent | Entropy policy | Task-family policy |
|---|---:|---:|---:|
| Action prediction / discriminative | 0.57 | 0.96 | 0.96 |
| Action prediction / inhibitory | 0.54 | 0.73 | 0.92 |
| Goal recognition / discriminative | 0.53 | **0.88** | **0.53** |
| Goal recognition / inhibitory | 0.52 | 0.67 | 0.52 |

Check out the goal recognition / discriminative cell. The task-family policy said to never re-represent goal-recognition scenarios and therefore stayed at 0.53. The entropy policy reached 0.88.

The held-out corpus supports the idea that what the richer representation contributes matters independently of whether the task is action prediction or goal recognition. Separating representational function from task family showed why the task-family heuristic was misleading. The entropy response, unlike task family, continued to provide a useful escalation signal once that confound was removed.

So what is the overall finding? **The initial representation doesn't need to recognize its own inadequacy. A limited representational intervention can perturb the inference, and the response to that perturbation can tell us whether deeper re-representation is likely to be worthwhile.**

And yet... there's always an "and yet." At this point, I've shown that a selective re-representation trigger exists. I have not shown that this implementation saves compute. In fact, there was still one fairly large cheat in all of this. Every time I said “re-represent,” the rich representation was already sitting in a YAML file waiting for me. That's not re-representation. That's a lookup. 

## Making re-representation real

Lookups are cheap. Storing all of your data in text files is not. But more than that, I would argue that rich representations shouldn't be stored at all. Instead, only the history should be stored (preferably in a database), and beliefs should be derived from those as needed. That's the computational cost of re-representation.

We can argue over the merits of various databases on another blog post, but for the purposes of this experiment, I chose to store my data in a Neo4j knowledge graph. Using a knowledge graph makes the deduction step easy to implement, so it seemed like the natural choice.

The knowledge graph stores facts about entities, relationships, events, etc. Here it stored the contents of each sparse scenario, the associated history, and whether an event supersedes another. So it has facts like:
- Sam observes the report in the office.
- The report moves from the office to the conference room.
- The report moving supersedes its previous location.

This is sufficient to derive that, based on Sam's epistemic history, Sam believes the report is in the office under the graph’s epistemic rules. But that fact itself isn't stored anywhere. False beliefs can emerge from differences in access to the events that establish the world state.

In terms of the implementation, this is an architectural change:

![Previous vs new setup: authored beliefs vs beliefs derived from epistemic history](/images/setup_pipelines.png)

This also gives a very concrete use for the entropy trigger during inference:

![Inference pipeline with entropy-based escalation](/images/inference_pipeline.png)

But does it change the experiment? Derived beliefs aren't guaranteed to be one-to-one with authored ones—and in fact, they were not. In this implementation, they spell out negatives implied by exclusivity (i.e., what Sam does not know) and only include beliefs that are relevant to the queried agent.

So, I reran the experiment using the updated pipelines. Across both the development and held-out datasets, there were **0 corrections, 0 regressions, and no material change in acceptable mass**. The contents of the rich representation changed, but the results didn't. 

As a bonus, this provides evidence that the benefit of the rich representation isn't just in explicitly spelling out the belief. There were effectively no performance effects of removing irrelevant other-agent beliefs or making exclusivity implications explicit. What rich buys isn't merely explicit wording. It's having the relevant belief available at all.

At this point, then, the lookup problem is solved. The rich representation can be constructed from epistemic history when the entropy trigger says it's worth doing, and Jev behaves essentially the same whether that belief was authored by me or derived from the graph. That makes the architecture much closer to the re-representation story I started with. But it also exposes the next question more clearly: does any of this actually save work?

So far, I've shown that we can selectively decide when to construct a richer representation. I haven't shown that the cost of making that decision, deriving the belief, and running another inference is cheaper than simply constructing the rich representation every time.

In terms of Jev tokens, it is not, in fact, cheaper in this experiment. The history representation itself is even slightly larger than rich:

| Representation | Mean input tokens |
| -------------- | ----------------: |
| Sparse         |               381 |
| History        |               442 |
| Rich           |               412 |

The pipeline requires both a sparse and a history inference for every scenario, plus a rich inference whenever the trigger fires. So this is not evidence that entropy-based escalation saves Jev inference compute. The potential savings are actually in not constructing the rich representation unless we need it. In this implementation, that means avoiding the graph materialization step on scenarios where the history probe doesn't trigger escalation.

Whether that trade is actually worthwhile depends on the relative costs of probing, materializing beliefs, and running Jev in a real system. I haven't measured those costs here. What this experiment establishes is narrower: there is a signal we can use to decide selectively when to incur the cost of re-representation.

## Back to the old idea

I started this project because I wanted to revisit an old idea: maybe efficient and effortful theory of mind don’t require different reasoning systems. Maybe the difference comes from what has been represented. I think the results are broadly consistent with the original hypothesis, but, as always, with some nuance.

1. It is clear that the same reasoner behaves differently given different representations. 
2. Representing evidence for a belief is not the same as representing the belief directly.
3. You can selectively decide when richer representation is likely to be useful without requiring the initial representation to diagnose its own failure.

That selective re-representation is the interesting piece. The old account had re-representation being triggered by something like conflict detection. What I hadn't really considered was the control problem: how can a reasoner recognize that the representation it is currently using is insufficient when the evidence of that insufficiency isn't represented yet?

These results suggest that it may not have to. A limited representational perturbation can reveal instability that the original representation could not.

Zooming out, in this experiment, I've only tested the re-representation question on one dataset, in the theory of mind reasoning domain. This isn't evidence that it'll work on every type of data, in every domain. But there are likely other domains where a cheap representation is adequate most of the time, and a limited representational probe can help decide whether to escalate. 

I started with the question of whether a model could benefit from effortful re-representation. The more interesting answer turned out to be that the hard part isn’t just constructing a richer representation, but knowing when to bother.

Sparse reasoning may be perfectly coherent and still be missing the thing that would change its mind. A small representational intervention can expose that instability, and only then do we pay for the richer state.

Maybe the goal isn’t to build systems that always reason richly. Maybe it’s to build systems that know when a cheap representation has stopped being enough.

*The code and scenarios for these experiments are on GitHub at [irabkina/tom-jev](https://github.com/irabkina/tom-jev).*

[^1]: Rabkina, I., & McFate, C. (2023). *Should Agents Have Two Systems to Track Beliefs and Belief-Like States?* In N. Gurney, S. Marathe, S. K. Bhamidipati, M. K. Dorneich, & C. Lebiere (Eds.), *Computational Theory of Mind for Human-Machine Teams* (pp. 149–157). Springer. <https://doi.org/10.1007/978-3-031-21671-8_9>
