// the FFT shared by the analyses (no node imports: the browser bundle may use it too)
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error("FFT length not a power of two");
  for (let i = 1, j = 0; i < n; i++) { // bit-reversal permutation
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let s = 1; s < n; s *= 2) {
    const m = s * 2;
    const wm = Math.PI / s;
    for (let k = 0; k < s; k++) {
      const wr = Math.cos(wm * k);
      const wi = Math.sin(wm * k);
      for (let j = k; j < n; j += m) {
        const t = j + s;
        const tre = re[t] * wr - im[t] * wi;
        const tim = re[t] * wi + im[t] * wr;
        re[t] = re[j] - tre;
        im[t] = im[j] - tim;
        re[j] += tre;
        im[j] += tim;
      }
    }
  }
}
