/** A short blip. Created per call so no AudioContext is held open (or created before a gesture). */
export const beep = (): void => {
  try {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.05, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.12);
    osc.onended = () => void ac.close();
  } catch {
    // Audio is optional.
  }
};
