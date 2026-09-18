# How to explain things

**Scope: the whole repository.**

This applies to every explanation — in a session, in a document, in an artifact.

1. **Plain English, the tone of someone explaining to a junior.** Short sentences. No
   stacked jargon; if a technical term is necessary, define it the first time it appears.
2. **One concept per section, each with its own heading.** Never two notions in the same
   block.
3. **Start from WHY it exists, before the how.** "The customer does not pick *between 10am
   and 11am*, they pick an exact time — so the range has to be sliced."
4. **One concrete, numbered example**, usually a small table or a code block, with real
   values rather than `X` and `Y`.
5. **Then "three things to remember"**: the non-obvious points, each with its reason —
   never the rule on its own.
6. **Finish with the trap**: the one that surprises, or that costs debugging time.

**Where it does NOT apply.** This is a format for explanations, not a format for
everything. A one-line factual answer stays one line. An end-of-work report keeps its
report shape. It changes nothing about commit messages, PR bodies, or code comments,
which have their own rules.
