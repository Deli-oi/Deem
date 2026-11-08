#!/usr/bin/env python3
# 4-corner touch calibration -> libinput CalibrationMatrix. Waits for 4 taps.
import struct, time, select, sys, subprocess, glob

AMIN, AMAX = 0, 4095
TIMEOUT = 90.0
CONF = '/etc/X11/xorg.conf.d/40-deem-touch.conf'
# on-screen target centers (fractions), matching calib.html: TL,TR,BR,BL
TARGETS = [(0.10, 0.10), (0.90, 0.10), (0.90, 0.90), (0.10, 0.90)]

def find_node():
    for p in glob.glob('/sys/class/input/event*/device/name'):
        try:
            if 'ADS7846' in open(p).read():
                return '/dev/input/' + p.split('/')[4]
        except Exception:
            pass
    return '/dev/input/event5'

DEV = find_node()
print("device: " + DEV, flush=True)
fmt = 'llHHI'; sz = struct.calcsize(fmt)
f = open(DEV, 'rb', buffering=0)

cx = cy = None
clusters = []; cur = []
end = time.time() + TIMEOUT
print("WAITING for 4 taps (TL,TR,BR,BL)...", flush=True)
while time.time() < end and len(clusters) < 4:
    r, _, _ = select.select([f], [], [], 0.2)
    now = time.time()
    if cur and now - cur[-1][0] > 0.6:        # release gap -> close cluster
        if len(cur) >= 2:
            clusters.append(cur)
            print("  got corner %d: raw x=%.0f y=%.0f" % (
                len(clusters),
                sum(p[1] for p in cur)/len(cur),
                sum(p[2] for p in cur)/len(cur)), flush=True)
        cur = []
    if not r:
        continue
    d = f.read(sz)
    if not d or len(d) < sz:
        continue
    s, us, typ, code, val = struct.unpack(fmt, d)
    if typ == 3:
        if code == 0: cx = val
        elif code == 1: cy = val
    elif typ == 0 and code == 0:
        if cx is not None and cy is not None:
            cur.append((time.time(), cx, cy))
if cur and len(cur) >= 2 and len(clusters) < 4:
    clusters.append(cur)

if len(clusters) < 4:
    print("FAILED: only %d taps captured. Re-run." % len(clusters), flush=True)
    sys.exit(1)

pts = [(sum(p[1] for p in c)/len(c), sum(p[2] for p in c)/len(c)) for c in clusters[:4]]
U = [((x-AMIN)/(AMAX-AMIN), (y-AMIN)/(AMAX-AMIN)) for (x, y) in pts]

def solve(tv):
    A = [[0.0]*3 for _ in range(3)]; B = [0.0]*3
    for (u, v), tval in zip(U, tv):
        row = [u, v, 1.0]
        for i in range(3):
            for j in range(3): A[i][j] += row[i]*row[j]
            B[i] += row[i]*tval
    M = [A[i][:] + [B[i]] for i in range(3)]
    for i in range(3):
        if abs(M[i][i]) < 1e-12:
            for k in range(i+1, 3):
                if abs(M[k][i]) > abs(M[i][i]): M[i], M[k] = M[k], M[i]; break
        piv = M[i][i]
        for j in range(i, 4): M[i][j] /= piv
        for k in range(3):
            if k != i:
                fct = M[k][i]
                for j in range(i, 4): M[k][j] -= fct*M[i][j]
    return [M[0][3], M[1][3], M[2][3]]

ax = solve([t[0] for t in TARGETS])
ay = solve([t[1] for t in TARGETS])
mat = [ax[0], ax[1], ax[2], ay[0], ay[1], ay[2], 0.0, 0.0, 1.0]
ms = " ".join("%.5f" % v for v in mat)
print("MATRIX " + ms, flush=True)

content = ('Section "InputClass"\n'
           '    Identifier  "Deem ADS7846 Touch"\n'
           '    MatchProduct "ADS7846 Touchscreen"\n'
           '    Driver "libinput"\n'
           '    Option "CalibrationMatrix" "%s"\n'
           'EndSection\n') % ms
open('/tmp/40-deem-touch.conf', 'w').write(content)
subprocess.run(["cp", "/tmp/40-deem-touch.conf", CONF], check=True)
print("PERSISTED -> " + CONF, flush=True)
print("DONE", flush=True)
