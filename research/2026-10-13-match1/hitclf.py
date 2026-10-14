import numpy as np, json, itertools
from sklearn.ensemble import HistGradientBoostingClassifier
from padel_engine.annotations import RallySet, Rally
from padel_engine.evaluate import evaluate
H = np.load('hits8.npy'); t = H[:, 0]; X = np.load('hitX.npy')
d = json.load(open('gt2.json')); G = d['rallies']; RU = d['reviewed_until_ms'] / 1000; MID = 1568.658
y = np.zeros(len(t), int)
for g in G:
    y[(t >= g['start_ms'] / 1000 - 0.3) & (t <= g['end_ms'] / 1000)] = 1
A = t < MID; B = (t >= MID) & (t < RU)
def gtset(lo, hi):
    return RallySet('m', 'trepied_vitre', None, [Rally(g['start_ms'], g['end_ms']) for g in G if lo <= g['start_ms'] / 1000 < hi], 'ground_truth')
def build(p, mask, thr, gap, nmin, pre, post):
    tt = t[mask & (p > thr)]
    out, cur = [], []
    for x in tt:
        if cur and x - cur[-1] > gap:
            if len(cur) >= nmin: out.append(cur)
            cur = []
        cur.append(x)
    if len(cur) >= nmin: out.append(cur)
    R = []
    for c in out:
        s, e = max(0, c[0] - pre), c[-1] + post
        if R and s * 1000 <= R[-1].end_ms: R[-1] = Rally(R[-1].start_ms, int(e * 1000))
        else: R.append(Rally(int(s * 1000), int(e * 1000)))
    return RallySet('m', 'trepied_vitre', None, R, 'prediction')
def fit(m): return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, random_state=0).fit(X[m], y[m])
# p sur A par CV interne (4 blocs), p sur B par modèle entraîné sur A
pA = np.zeros(len(t))
edges = np.linspace(0, MID, 5)
for k in range(4):
    te = (t >= edges[k]) & (t < edges[k + 1]); pA[te] = fit(A & ~te).predict_proba(X[te])[:, 1]
pB = fit(A).predict_proba(X)[:, 1]
from sklearn.metrics import roc_auc_score
print('AUC frappe  A(cv) %.3f  B(test) %.3f  | z seul B %.3f' % (roc_auc_score(y[A], pA[A]), roc_auc_score(y[B], pB[B]), roc_auc_score(y[B], X[B, -1])))
gA, gB = gtset(0, MID), gtset(MID, RU)
best = []
for thr, gap, nmin, pre, post in itertools.product([0.3, 0.4, 0.5, 0.6], [1.5, 2.0, 2.5, 3.0], [2, 3, 4], [0.3, 0.8], [1.5, 2.0, 2.5]):
    r = evaluate(gA, build(pA, A, thr, gap, nmin, pre, post))
    best.append((2 * r['recall'] + r['precision'], r['recall'], r['precision'], (thr, gap, nmin, pre, post)))
best.sort(reverse=True)
print('meilleur réglage sur A :', best[0])
for _, _, _, prm in best[:3]:
    r = evaluate(gB, build(pB, B, *prm))
    print('TEST B', prm, 'rappel %.1f précision %.1f fin méd %.2f début méd %.2f' % (100 * r['recall'], 100 * r['precision'], r['end_error_median_s'], r['start_error_median_s']))
np.save('pB.npy', pB); np.save('pA.npy', pA)
