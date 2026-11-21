// One page for the soccer overlays (all click-through): a goal mouth (`?kind=goal&team=red|blue`, drawn
// by CSS alone) or the scoreboard (`?kind=score`), which polls the main process for the score.
const q = new URLSearchParams(location.search);

if (q.get('kind') === 'goal') {
  document.body.classList.add(q.get('team') === 'blue' ? 'goal-blue' : 'goal-red');
} else {
  document.body.classList.add('score');
  const score = document.getElementById('score') as HTMLElement;
  const note = document.getElementById('note') as HTMLElement;
  const refresh = async (): Promise<void> => {
    const m = await window.electronAPI.getMatch();
    if (!m) return;
    score.textContent = `RED ${m.red} – ${m.blue} BLUE`;
    note.textContent = m.winner ? `${m.winner.toUpperCase()} WINS` : m.kickoff ? 'Kick-off…' : '';
  };
  void refresh();
  setInterval(() => void refresh(), 150);
}
