"""Caractéristiques par frappe candidate (z > 8) : timbre + contexte rythmique."""
import numpy as np
from scipy.io import wavfile
sr, x = wavfile.read('match24.wav', mmap=True)
H = np.load('hits8.npy')  # t, z
t = H[:, 0]; z = H[:, 1]
W = int(0.06 * sr)  # 60 ms après l'attaque
freqs = np.fft.rfftfreq(W, 1 / sr)
bands = [(100, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 12000)]
F = []
win = np.hanning(W)
for ti in t:
    i = int(ti * sr) - int(0.005 * sr)
    seg = np.asarray(x[max(0, i):max(0, i) + W], dtype=np.float32) / 32768
    if len(seg) < W: seg = np.pad(seg, (0, W - len(seg)))
    pre = np.asarray(x[max(0, i - W):max(0, i)], dtype=np.float32) / 32768
    sp = np.abs(np.fft.rfft(seg * win)) ** 2 + 1e-12
    be = [np.log10(sp[(freqs >= a) & (freqs < b)].sum()) for a, b in bands]
    cen = (freqs * sp).sum() / sp.sum()
    env = np.abs(seg); pk = env.argmax(); peak = env[pk]
    # décroissance : temps pour tomber sous 30 % du pic (lissé)
    sm = np.convolve(env, np.ones(48) / 48, 'same')
    after = np.where(sm[pk:] < 0.3 * sm[pk])[0]
    decay = (after[0] if len(after) else W - pk) / sr
    rms_pre = np.sqrt((pre ** 2).mean() + 1e-12)
    F.append(be + [cen, np.log10(peak + 1e-9), decay, np.log10(peak / rms_pre + 1e-9)])
F = np.array(F, np.float32)
# contexte
def cnt(thr, w):
    s = t[z > thr]
    return np.searchsorted(s, t + w) - np.searchsorted(s, t - w)
ctx = []
for thr in (10, 20, 50):
    for w in (1.5, 3, 6):
        ctx.append(cnt(thr, w))
s12 = t[z > 12]
j = np.searchsorted(s12, t)
nxt = np.where(j + 1 < len(s12), s12[np.minimum(j + 1, len(s12) - 1)] - t, 30)
prv = np.where(j > 0, t - s12[np.maximum(j - 1, 0)], 30)
ctx += [np.minimum(nxt, 30), np.minimum(prv, 30)]
# régularité : écart-type des intervalles dans ±4 s
reg = []
for ti in t:
    a, b = np.searchsorted(s12, ti - 4), np.searchsorted(s12, ti + 4)
    d = np.diff(s12[a:b]); reg.append(d.std() / (d.mean() + 1e-6) if len(d) > 2 else 2)
ctx.append(np.array(reg))
X = np.concatenate([F, np.stack(ctx, 1).astype(np.float32), z[:, None]], 1)
np.save('hitX.npy', X)
print(X.shape)
