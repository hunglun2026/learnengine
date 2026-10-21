// 極簡音效：用 Web Audio 現場合成，不需要音檔。課堂上可能要靜音，所以預設可關。
let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem("cg-muted") === "1";
} catch {
  /* 無痕或封鎖儲存時忽略 */
}

export function isMuted(): boolean {
  return muted;
}
export function setMuted(v: boolean): void {
  muted = v;
  try {
    localStorage.setItem("cg-muted", v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + start;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {
    /* 瀏覽器不給播就算了，遊戲照玩 */
  }
}

export const sfx = {
  ok: () => {
    tone(660, 0, 0.12);
    tone(880, 0.1, 0.18);
  },
  bad: () => tone(180, 0, 0.25, "square", 0.08),
  flip: () => tone(520, 0, 0.06, "triangle", 0.1),
  tick: () => tone(400, 0, 0.04, "triangle", 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25)),
};
