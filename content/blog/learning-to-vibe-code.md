---
title: "Learning to Vibe Code"
date: 2026-10-11
draft: false

# Every post needs both: hero is 2400x1260, social preview is 1200x630 (JPEG in static/images/).
thumbnail: "images/learning-to-vibe-code-hero.jpg"
images: ["images/learning-to-vibe-code-social.jpg"]
---

## I'm late to this

It feels odd to write a blog post about vibe coding in late 2026. All those posts were written back in early 2025. But here we are.

I've spent the last few years working for a defense contractor, largely on projects involving LLMs, agents, and neurosymbolic systems. Perhaps ironically, for government and legal reasons, I've been pretty limited in how I could use those same AI tools during development.

Recently, though, I've had the opportunity to spend more time on projects where I get to choose my own tools.

I've always been a bit of a skeptic, so I didn't exactly jump into vibe coding with both feet, but I've been playing around with it quite a bit.

Here are my thoughts.

## The good

The most difficult part of any project for me is getting started. Something about staring at a blank page just makes it hard to do anything. And then there are the other obstacles before you get to actually testing an idea: unfamiliar libraries (that may only ever be used once), dependency issues, setting up boilerplate. It's just all so, well, boring. I've often decided that a side project just isn't worth the hassle. 

Vibe coding changes that calculation. 

I recently wrote on this blog about an experiment I ran with Jev and Neo4j. I'd worked with Neo4j before, so I knew roughly what implementing the knowledge graph would involve. But setting up the database, writing the queries, and connecting everything to the rest of the experiment wasn't really the part I was interested in. I wanted to know whether the approach would work.

With a coding agent, I could spend much less time on the plumbing and get to the interesting part much faster.

And that's what I've found most useful about vibe coding so far: it's not that I can suddenly build things I couldn't build before; it's that I'm much more willing to try things that I might otherwise have decided weren't worth the effort.

That extends to running multiple experimental conditions. In the Jev project, for example, I encountered negative result after negative result. For a personal side project, that might have been the end of the road in the past. But vibe coding made it so easy to say "let's try one more thing" that I eventually got to what I consider a pretty interesting result. That's not nothing.


## The bad

At one point during the Jev project, I threw my hands up and nearly gave up. The coding agent had made changes without my approval that made the code super convoluted and, even worse, messed up my dataset. It produced "amazing" results but had, in reality, changed the dataset to fit the hypothesis. 

I had to roll everything back, and give the agent clear instructions to *never* do anything without my approval. Ever.

Here's the thing: vibe coding makes it really easy to let this kind of issue slip by. We all get excited by good results! And these things sound so confident! But if I hadn't been paying close attention, I would have thought I found something interesting, when really I'd found, at best, an artifact or bug. Even now, I worry that I still missed something, and my results aren't as strong as they appear. That's not a great feeling, and, more importantly, it raises some serious questions about how we maintain scientific rigor when using coding agents.

The same thing that makes vibe coding so appealing is its greatest weakness. It moves so quickly, and acts so confidently, that it's easy for mistakes to slip in. When the same system is creating data, implementing experiments, and reporting results all while the human in charge is making a cup of coffee, it's hard to keep up. And checking it all to be sure that it did exactly what was expected can take as long as it would have taken to just implement everything by hand. Are you really saving time or effort at that point?


## The ugly

The one thing I do worry about whenever I use a coding agent is the effect on the environment. How much water am I wasting to avoid having to debug yet another dependency? I don't think I can do this conversation justice here. That's worth its own blog post.

## Finding a balance

So where does that leave me? I'm not ready to give up on coding agents. There are clearly some major benefits, especially for the kind of exploratory work I enjoy doing. 

But I'm not exactly comfortable setting a prompt and letting them go. I've learned that there's a pretty big difference between delegating the implementation of an idea and delegating decisions at the level of the experiment itself. I'm happy to let an agent write boilerplate, set up infrastructure, or implement a feature I've specified. I'm much less happy letting it decide what data to use, how to evaluate results, or whether a finding is meaningful.

And I'm still figuring out where to draw that line. The more closely I supervise the agent, the less time I save. But the less I supervise it, the less confident I am in what it's producing.

For now, I think the answer is somewhere in the middle. Which is perhaps not the most exciting conclusion to a blog post about vibe coding, but here we are.

