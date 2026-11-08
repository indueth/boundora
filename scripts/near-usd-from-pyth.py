"""Print the NEAR/USD price in millionths of a dollar, e.g. 3710000 for $3.71.
Tries Pyth (Hermes) first; public Hermes now answers 401 without an API key, so it falls back to Coinbase spot."""
import json, os, urllib.request

FEED = "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750"  # Pyth NEAR/USD
UA = {"User-Agent": "boundora-price-keeper"}


def get(url, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return json.load(urllib.request.urlopen(req, timeout=20))


def pyth():
    key = os.environ.get("PYTH_API_KEY")
    data = get(f"https://hermes.pyth.network/v2/updates/price/latest?ids[]={FEED}&parsed=true",
               {"Authorization": f"Bearer {key}"} if key else None)
    p = data["parsed"][0]["price"]
    return int(int(p["price"]) * 10 ** (int(p["expo"]) + 6))


def coinbase():
    return round(float(get("https://api.coinbase.com/v2/prices/NEAR-USD/spot")["data"]["amount"]) * 1_000_000)


for source in (pyth, coinbase):
    try:
        micro = source()
        break
    except Exception:
        continue
else:
    raise SystemExit("no NEAR/USD price source answered")
assert 10_000 <= micro <= 10_000_000_000, micro
print(micro)
