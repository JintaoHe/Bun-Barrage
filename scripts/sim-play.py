#!/usr/bin/env python3
"""Plays a full match in the Even Hub simulator via its automation API and
records the glasses display to sim/match.gif. Needs the app loaded with ?hint
and the simulator started with --automation-port 9898
(add &latency=110 to mimic real send times)."""
import json, threading, time, urllib.request, io, sys
from PIL import Image

A = 'http://localhost:9898'
frames, stop = [], False

def get(path):
    return urllib.request.urlopen(A + path, timeout=5).read()

def inp(action):
    req = urllib.request.Request(A + '/api/input', data=json.dumps({'action': action}).encode(),
                                 headers={'content-type': 'application/json'})
    urllib.request.urlopen(req, timeout=5).read()
    time.sleep(0.14)

def recorder():
    while not stop:
        t = time.time()
        try: frames.append((t, get('/api/screenshot/glasses')))
        except Exception: pass
        time.sleep(max(0, 0.11 - (time.time() - t)))

def console_since(i):
    es = json.loads(get('/api/console'))['entries']
    return [e for e in es if e['id'] > i]

last_id = max([e['id'] for e in json.loads(get('/api/console'))['entries']] + [-1])
threading.Thread(target=recorder, daemon=True).start()
time.sleep(1.5)
inp('click')                      # title -> match
shots, t0, over = 0, time.time(), None
while time.time() - t0 < 240 and not over:
    for e in console_since(last_id):
        last_id = max(last_id, e['id'])
        m = e['message']
        if 'match over' in m: over = m
        if '[bun] HINT' not in m: continue
        h = json.loads(m.split('HINT ', 1)[1])
        da = round((h["angle"] - h["cur"]) / 5)
        hold = (h["power"] - 10) / 45.0          # power climbs 45/s from 10
        print(f"turn {shots+1}: wind {h['wind']:+d}  aim {h['angle']}deg / power {h['power']}  -> {abs(da)} swipes, hold {hold:.2f}s", flush=True)
        for _ in range(abs(da)): inp('up' if da > 0 else 'down')
        time.sleep(0.4)
        inp('long_press')         # start charging
        time.sleep(max(0, hold - 0.14))
        inp('long_press_release') # fire
        shots += 1
    time.sleep(0.25)
print(over or 'timeout', flush=True)
time.sleep(2.5)
inp('click')                      # result -> title
time.sleep(1.2)
stop = True
time.sleep(0.3)

# Build GIF: crop to the image container, composite on black, 2x
imgs, durs = [], []
for i, (t, png) in enumerate(frames):
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    bg = bg.convert('RGB')
    if imgs and bg.tobytes() == imgs[-1].tobytes():
        durs[-1] += int((frames[i][0] - frames[i-1][0]) * 1000); continue
    imgs.append(bg); durs.append(110)
imgs[0].save('sim/match.gif', save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
imgs[len(imgs)//2].save('sim/match-mid.png')
print(f'{len(frames)} screenshots, {len(imgs)} unique frames, {sum(durs)/1000:.0f}s')
