# Fires 40 concurrent SSR requests from 20 sessions spread over 3 tenants (every 7th request is
# marked slow) and checks that each rendered page contains exactly its own user+tenant pair.
# EXPECT_LEAKS=1 turns the script into the negative control: it exits 0 only when leaks are seen,
# which proves the test can detect the module-level-client anti-pattern.
import concurrent.futures as cf, os, re, sys, urllib.request

APP_PORT = os.environ.get('APP_PORT', '3000')
EXPECT_LEAKS = os.environ.get('EXPECT_LEAKS') == '1'


def get(i):
    n = i % 20
    who, tenant, slow = f"user{n}", f"t{n % 3}", i % 7 == 0
    cookie = f"session={who}; tenant={tenant}" + ("; slow=1" if slow else "")
    req = urllib.request.Request(f"http://127.0.0.1:{APP_PORT}/", headers={"Cookie": cookie})
    html = urllib.request.urlopen(req, timeout=30).read().decode()
    pairs = set(re.findall(r"User of (user\d+) at (t\d+)", html))
    layer_rendered = "Rendered with layer base" in html  # the LayerDemo component from layers/base
    return (who, tenant), slow, pairs, layer_rendered


with cf.ThreadPoolExecutor(40) as ex:
    results = list(ex.map(get, range(40)))
leaks = [(own, got) for own, _slow, got, _layer in results if got != {own}]
slow_total = sum(1 for _own, slow, _got, _layer in results if slow)
slow_ok = sum(1 for own, slow, got, _layer in results if slow and got == {own})
layer_ok = sum(1 for _own, _slow, _got, layer in results if layer)
print(f"responses: {len(results)}  correct: {len(results) - len(leaks)}  leaks: {len(leaks)}  slow requests correct: {slow_ok}/{slow_total}  layer rendered: {layer_ok}/{len(results)}")
for own, got in leaks[:3]:
    print(f"  {own[0]}@{own[1]} received data of {sorted(got)}")
if EXPECT_LEAKS:
    print("negative control: leaks detected as expected" if leaks else "negative control FAILED: the anti-pattern did not leak, the test cannot see the bug")
    sys.exit(0 if leaks else 1)
if layer_ok != len(results):
    print("the production build did not render the layers/base component on every page")
    sys.exit(1)
sys.exit(1 if leaks else 0)
