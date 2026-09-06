# Outdoor GM — Game Ideas

A running idea log for **future games**: formats, traps, locations, and physical staging.
This is a scratchpad for game design, not a build queue — nothing here is committed work.
When an idea needs an app change to run, that's called out as an **App need**; if it turns
into real work it graduates to a numbered item in [ROADMAP.md](ROADMAP.md).

Ideas carry stable ids (`G1`–`Gn`) so they can be referenced in planning without renumbering.
Add new ones at the bottom of the right section.

---

## Game formats

### G1 — Night game, ranged weapons only
Play in the dark, and make it **all ranged weapons** — no melee/tag eliminations.

- Darkness does the balancing: the map matters more than speed, and the mini-map/GPS
  becomes the primary way a player knows where they are.
- Ranged-only changes engagement distance, so drops and checkpoints can sit closer
  together than in a daytime game without instantly resolving into a footrace.
- **Practical**: headlamps make you a target — worth writing into the rules whether light
  is allowed, banned, or a deliberate tradeoff. Safety floor: everyone carries a light even
  if they're not supposed to use it.
- **App need**: the play screen and GM map should be usable one-handed at night without
  wrecking night vision — a dark/red-shift map style is the obvious ask.

### G2 — Water game: canoes, tiny island cornucopia
Everyone is on the water in canoes, and the **cornucopia is a very small island**.

- The opening rush becomes a paddle, which stretches the start out and makes the "do I
  contest the cornucopia?" decision much more expensive to get wrong.
- A tiny island means the center is genuinely indefensible — you can't hold it, you can
  only raid it.
- **Practical**: PFDs, a chase boat, and a hard rule about what happens if a canoe swamps.
  Phones need dry bags; GPS through a dry bag is fine, touchscreens mostly aren't.
- **App need**: boundary is the real safety mechanism here — the boundary-exit alert
  matters far more on open water than in the woods.

---

## Traps & items

### G3 — The "trap kit" that is just a paper bag
Hand out a **trap kit** that is, in fact, a paper bag. Players set it out for someone else.

- The comedy is the point: the object is inert, but *finding* one means someone was here
  and meant it for you. The paranoia is the mechanic.
- Works best if a bag can actually do something — GM-adjudicated — so players can never be
  sure it's a dud. A real effect attached to some bags and not others is the strongest version.
- **App need**: maps cleanly onto a **`gm-prompted` runbook entry** — the GM watches a player
  walk into a placed bag and fires the effect by hand from the runbook.

### G4 — Noise-cancelling headphones penalty
A set of noise-cancelling headphones a player has to **wear for a set amount of time**.

- Sensory deprivation as a hazard is much more interesting than a movement penalty — you
  keep all your speed and lose all your warning.
- Natural fit as a **hazard** effect with a duration: "wear these for 15 minutes."
- **Practical**: this cuts a player off from being shouted at, which is a real safety
  consideration. Cap the duration, and make the app-side timer authoritative so the player
  can see when they're allowed to take them off.
- **App need**: a hazard with a **visible countdown** on the player screen, and a local
  notification when it expires (same plumbing as the ration eat-window reminder).

---

## Locations

### G5 — Page Pond
Play **around the pond**, possibly using the water itself as a feature.

- Idea: **remove the players' ability to see what is water and what is not** — the mini-map
  stops distinguishing shoreline, so route-finding has to happen with your eyes, not the
  phone. Big lift in tension, and it stops the map from solving the terrain for you.
- **App need**: a player-side map style with water/land contrast stripped out, while the GM
  keeps a normal map. Worth checking what Mapbox/Google styling allows on each platform
  before promising it.

### G6 — Ragged Island or Five Mile Island, Winnipesaukee
Island play on Winnipesaukee. Pairs naturally with **G2** (canoes) — an island is a
self-enforcing boundary, which is the cheapest safety net there is.

- **Practical**: access and landing rights need checking before anything else. Cell coverage
  on the lake is worth testing on-site — the offline write queue matters here.

### G7 — Mooney Island, Squam
Same shape as G6, different water. Smaller and quieter; likely the better first test of an
island game before committing to a bigger one.

---

## Physical staging

### G8 — Bedsheet maze
Build a small maze out of **old bedsheets**, ideally as a **final location**. All the drops
sit inside it — they're trivially easy to spot, but the maze will 100% slow you down.

- Inverts the usual search problem: the challenge stops being "where is it" and becomes
  "how long am I exposed while I go get it." Excellent endgame pressure.
- Sheets are cheap, packable, and fail safely (you can run through a wall if you have to).
- **Practical**: the maze is a GPS dead zone in practice — everyone inside reads as the same
  point. Treat the whole maze as one checkpoint rather than expecting position resolution
  inside it.

### G9 — Drops hung from trees
Hang everything **just out of reach of the tallest player**.

- Open problem: this straightforwardly **benefits taller players**, which is the thing to
  design out. Options worth trying:
  - Use **climbable trees**, so the skill is climbing rather than standing height.
  - Require a tool (a stick, a rope, a thrown weight) — then it's about what you carry,
    not how tall you are.
  - Set the height above *everyone's* reach, so nobody solves it by reaching and the
    tallest player's advantage collapses.
- **Practical**: anything that induces climbing has real fall risk. Height ceiling, no
  climbing in the dark, and don't combine this with **G1**.
