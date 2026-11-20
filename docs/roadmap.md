# Roadmap

Queued by the owner (2026-11-20), in order. Each should be prototyped in the demo first, then ported to
the app.

1. **Scoring and teams** (soccer proper): two sides, goals at the display edges, a score display, as an
   opt-in mode on top of kick-about. Needs a team notion on sheep (and a way to tell the teams apart:
   a tint or a marker), goals, and score state shared the same way the ball is (main process in the
   app).
2. **Tag or chase**: one sheep is "it" and runs at another; the roles swap on contact. Mostly steering
   plus the greeting that already exists.
3. **Sheep as platforms (stacking)**: a sheep can land on another's back, or hop onto a sleeping sheep,
   using the other-sheep rectangles that leaping already uses.

Done: leaping, greeting, kick-about (demo and app). Hardware-bound items (Windows and macOS runs) are
tracked in the README's Known gaps.
