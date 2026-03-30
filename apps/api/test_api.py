"""Quick test script for the NL-to-SQL API."""
import urllib.request
import json

URL = "http://localhost:8001/nl-to-sql"

prompts = [
    "what is the average sales amount",
    "count all sales records",
    "show top 5 regions by total sales",
    "show me sales in January",
]

for p in prompts:
    data = json.dumps({"prompt": p}).encode()
    req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    print(f"Prompt:  {p}")
    print(f"Source:  {result['source']}")
    print(f"SQL:     {result['sql']}")
    print("-" * 60)
