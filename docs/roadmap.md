# Roadmap

Queued by the owner (2026-11-20), in order. Each is prototyped in the demo first, then ported to the
app.

1. **Scoring and teams** (soccer proper): two sides, goals at the display edges, a score display, as an
   opt-in mode on top of kick-about. Needs a team notion on sheep (and a way to tell the teams apart:
   a tint or a marker), goals, and score state shared the same way the ball is (main process in the
   app). _Not started._
2. ~~**Tag or chase**~~ Done (demo and app): ADR 21.
3. ~~**Sheep as platforms (stacking)**~~ Done (demo and app, automatic): ADR 21.

Done: leaping, greeting, kick-about, tag, stacking. Hardware-bound items (Windows and macOS runs) are
tracked in the README's Known gaps.
