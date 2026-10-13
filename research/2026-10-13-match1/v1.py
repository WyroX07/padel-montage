import numpy as np, json, sys
from scipy.ndimage import uniform_filter1d, maximum_filter1d
from sklearn.ensemble import HistGradientBoostingClassifier
from padel_engine.annotations import RallySet, Rally
from padel_engine.evaluate import evaluate

FPS = 5
H = np.load('hits8.npy')            # (t, z) seuil 8
fg = np.load('fg_feats.npy')
N = len(fg); T = np.arange(N) / FPS
gt = RallySet.load('gt.json'); RU = gt.reviewed_until_ms / 1000

def hit_counts(thr, win):
    t = H[H[:, 1] > thr, 0]
    idx = np.clip((t * FPS).astype(int), 0, N - 1)
    c = np.bincount(idx, minlength=N).astype(np.float32)
    return uniform_filter1d(c, int(win * FPS) * 2 + 1) * (int(win * FPS) * 2 + 1)

def time_to(thr, direction):
    t = H[H[:, 1] > thr, 0]
    j = np.searchsorted(t, T)
    if direction > 0:
        d = np.where(j < len(t), t[np.minimum(j, len(t) - 1)] - T, 30)
    else:
        d = np.where(j > 0, T - t[np.maximum(j - 1, 0)], 30)
    return np.minimum(d, 30)

cols = []
for thr in (10, 20, 50):
    for w in (1, 2.5, 5, 10):
        cols.append(hit_counts(thr, w))
for thr in (12, 30):
    cols += [time_to(thr, 1), time_to(thr, -1)]
z = H; zmax = np.zeros(N); idx = np.clip((z[:, 0] * FPS).astype(int), 0, N - 1); np.maximum.at(zmax, idx, z[:, 1])
for w in (1, 3): cols.append(maximum_filter1d(zmax, int(w * FPS) * 2 + 1))
fgs = fg.copy(); fgs[fgs < 0] = np.nan
for k in range(fg.shape[1]):
    x = np.nan_to_num(fgs[:, k], nan=-1)
    for w in (1, 3, 8):
        cols.append(uniform_filter1d(x, int(w * FPS) * 2 + 1))
    d = np.abs(np.diff(x, prepend=x[0]))
    cols.append(uniform_filter1d(d, 2 * FPS + 1))
X = np.stack(cols, 1)
y = np.zeros(N, int)
for r in gt.rallies:
    y[int(r.start_ms / 1000 * FPS):int(r.end_ms / 1000 * FPS)] = 1
lab = T < RU

def segments(p, on, off, min_len=3.0, merge_gap=0.8):
    segs = []; inside = False
    for i, v in enumerate(p):
        if not inside and v > on: inside, s = True, i
        elif inside and v < off: inside = False; segs.append([s, i])
    if inside: segs.append([s, len(p)])
    out = []
    for s, e in segs:
        if out and (s - out[-1][1]) / FPS < merge_gap: out[-1][1] = e
        else: out.append([s, e])
    return [(s / FPS, e / FPS) for s, e in out if (e - s) / FPS >= min_len]

def to_set(segs, src):
    return RallySet('match.MOV', 'trepied_vitre', None, [Rally(int(a * 1000), int(b * 1000)) for a, b in segs], src)

# validation croisée par blocs de temps (4 blocs dans la zone vérifiée)
edges = np.linspace(0, RU, 5)
P = np.full(N, np.nan)
for k in range(4):
    test = (T >= edges[k]) & (T < edges[k + 1])
    train = lab & ~test
    m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0)
    m.fit(X[train], y[train])
    P[test] = m.predict_proba(X[test])[:, 1]
p = uniform_filter1d(np.nan_to_num(P[lab]), 5)
best = []
for on in (0.4, 0.5, 0.6):
    for off in (0.2, 0.3, 0.4):
        if off >= on: continue
        for ml in (2.0, 3.0, 4.0):
            segs = segments(p, on, off, ml)
            r = evaluate(gt, to_set(segs, 'prediction'))
            best.append((r['recall'], r['precision'], r['start_error_median_s'], r['end_error_median_s'], on, off, ml, len(segs)))
best.sort(key=lambda x: (-(x[0] * 2 + x[1]),))
for b in best[:8]: print(' '.join(f'{v:.2f}' if isinstance(v, float) else str(v) for v in b))
np.save('X.npy', X); np.save('y.npy', y)
