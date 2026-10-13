import numpy as np
exec(open('scripts/v1.py').read().split('# validation croisée')[0])
from padel_engine.detect_audio import AudioV0Params, group_rallies
from sklearn.ensemble import HistGradientBoostingClassifier
edges = np.linspace(0, RU, 5)
P = np.full(N, np.nan)
for k in range(4):
    test = (T >= edges[k]) & (T < edges[k + 1]); train = lab & ~test
    m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0).fit(X[train], y[train])
    P[test] = m.predict_proba(X[test])[:, 1]
p = uniform_filter1d(np.nan_to_num(P), 5)
hits = H[H[:, 1] > 12, 0]
def run(gap, nmin, post, split_thr, split_len, drop_thr, pre=0.3):
    C = group_rallies(hits, AudioV0Params(12, gap, nmin, pre, post), None)
    out = []
    for c in C:
        a, b = int(c.start_ms / 200), int(c.end_ms / 200)
        if a >= len(p) or c.start_ms / 1000 > RU: continue
        seg = p[a:b]
        # coupe là où la proba reste basse assez longtemps
        low = seg < split_thr
        cuts, i = [], 0
        while i < len(low):
            if low[i]:
                j = i
                while j < len(low) and low[j]: j += 1
                if (j - i) / FPS >= split_len: cuts.append((i, j))
                i = j
            else: i += 1
        bounds, s = [], 0
        for i, j in cuts: bounds.append((s, i)); s = j
        bounds.append((s, len(seg)))
        hs = np.array(c.hits) / 1000
        for s, e in bounds:
            ta, tb = (a + s) / FPS, (a + e) / FPS
            hh = hs[(hs >= ta - 0.3) & (hs <= tb)]
            if len(hh) < 2 or seg[s:e].mean() < drop_thr: continue
            out.append((max(0, hh[0] - pre), hh[-1] + post))
    return out
res = []
for gap in (2.5, 3.0, 4.0):
  for nmin in (2, 3, 4):
    for post in (1.5, 2.0, 2.5):
      for st in (0.15, 0.25):
        for sl in (1.0, 2.0):
          for dt in (0.0, 0.2, 0.3):
            r = evaluate(gt, to_set(run(gap, nmin, post, st, sl, dt), 'prediction'))
            res.append((r['recall'], r['precision'], r['start_error_median_s'], r['end_error_median_s'], gap, nmin, post, st, sl, dt))
res.sort(key=lambda x: -(2 * x[0] + x[1]))
for b in res[:10]: print(' '.join(f'{v:.2f}' if isinstance(v, float) else str(v) for v in b))
