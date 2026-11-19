export {};
(() => {
  const speed = document.getElementById('speed') as HTMLInputElement;
  const speedOut = document.getElementById('speedOut') as HTMLOutputElement;
  const sound = document.getElementById('sound') as HTMLInputElement;
  const pack = document.getElementById('pack') as HTMLSelectElement;
  const status = document.getElementById('status') as HTMLSpanElement;
  const form = document.getElementById('form') as HTMLFormElement;

  speed.addEventListener('input', () => {
    speedOut.textContent = Number(speed.value).toFixed(1);
  });

  void Promise.all([window.electronAPI.loadPrefs(), window.electronAPI.listPacks()]).then(
    ([p, packs]) => {
      for (const name of packs) pack.add(new Option(name, name));
      pack.value = p.pack;
      speed.value = String(p.speed);
      speedOut.textContent = p.speed.toFixed(1);
      sound.checked = p.sound;
    },
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.electronAPI.savePrefs({
      speed: Number(speed.value),
      sound: sound.checked,
      pack: pack.value,
    });
    status.textContent = 'Saved';
  });
})();
