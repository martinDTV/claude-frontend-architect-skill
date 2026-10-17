import concurrent.futures as cf, re, sys, urllib.request

def get(i):
    who = f"user{i % 20}"
    req = urllib.request.Request("http://127.0.0.1:3000/", headers={"Cookie": f"session={who}"})
    html = urllib.request.urlopen(req, timeout=20).read().decode()
    return who, set(re.findall(r"User of (user\d+)", html))

with cf.ThreadPoolExecutor(40) as ex:
    results = list(ex.map(get, range(40)))
leaks = [(w, n) for w, n in results if n != {w}]
print(f"responses: {len(results)}  correct: {len(results) - len(leaks)}  leaks: {len(leaks)}")
for w, n in leaks[:3]:
    print(f"  {w} received data of {sorted(n)}")
sys.exit(1 if leaks else 0)
