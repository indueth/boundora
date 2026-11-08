"""Print the NEAR/USD price from Pyth (Hermes) in millionths of a dollar, e.g. 3710000 for $3.71."""
import json, urllib.request
FEED = "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750"  # Pyth NEAR/USD
url = f"https://hermes.pyth.network/v2/updates/price/latest?ids[]={FEED}&parsed=true"
data = json.load(urllib.request.urlopen(url, timeout=20))
p = data["parsed"][0]["price"]
micro = int(int(p["price"]) * 10 ** (int(p["expo"]) + 6))
assert 10_000 <= micro <= 10_000_000_000, micro
print(micro)
