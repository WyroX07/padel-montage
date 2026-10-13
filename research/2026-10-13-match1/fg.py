import subprocess, numpy as np, cv2, sys
W, H, FPS = 480, 270, 5
files = sys.argv[1:]
mog = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)
feats = []
for f in files:
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", f, "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    while True:
        b = p.stdout.read(W * H * 3)
        if len(b) < W * H * 3: break
        img = np.frombuffer(b, np.uint8).reshape(H, W, 3)
        m = mog.apply(img)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(m)
        # far = au-dessus de la ligne du filet (~y 105/270), near = dessous
        bot = lambda i: st[i][1] + st[i][3]
        far = [(st[i], cen[i]) for i in range(1, n) if st[i][4] >= 10 and 95 <= bot(i) <= 114 and st[i][3] < 45 and 140 <= cen[i][0] <= 350]
        near = [(st[i], cen[i]) for i in range(1, n) if st[i][4] >= 80 and bot(i) > 114]
        fa = sum(s[4] for s, _ in far); na = sum(s[4] for s, _ in near)
        fx = np.mean([c[0] for _, c in far]) if far else -1
        nx = np.mean([c[0] for _, c in near]) if near else -1
        ny = max([s[1] + s[3] for s, _ in near], default=-1)  # pied le plus bas
        feats.append([fa, na, len(far), len(near), fx, nx, ny, (m[80:114, 140:350] > 0).mean(), (m[114:] > 0).mean()])
    p.wait()
np.save("fg_feats.npy", np.array(feats, np.float32))
print(len(feats))
