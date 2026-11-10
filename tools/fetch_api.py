"""문화공공데이터광장 API에서 장미 데이터를 받아 tools/raw/에 저장한다.

인증키는 tools/.keys 에 둔다 (저장소와 웹앱에는 넣지 않는다).
  CULTURE_KEY_ROSE_INFO=...     올림픽공원장미정보 (getKSCD0801)
  CULTURE_KEY_ROSE_GARDEN=...   올림픽공원장미광장 (KSCrose)

실행: python3 -I tools/fetch_api.py
"""
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APIS = {
    "rose_info.xml": ("CULTURE_KEY_ROSE_INFO", "https://api.kcisa.kr/openapi/service/rest/meta13/getKSCD0801"),
    "rose_garden.xml": ("CULTURE_KEY_ROSE_GARDEN", "https://api.kcisa.kr/openapi/service/rest/meta/KSCrose"),
}


def load_keys():
    keys = dict(os.environ)
    path = os.path.join(HERE, ".keys")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "=" in line:
                k, v = line.strip().split("=", 1)
                keys[k] = v
    return keys


def main():
    keys = load_keys()
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    for fname, (kname, url) in APIS.items():
        key = keys.get(kname)
        if not key:
            print(f"{kname} 없음: {fname} 건너뜀")
            continue
        q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": 1000, "pageNo": 1})
        with urllib.request.urlopen(f"{url}?{q}", timeout=60) as r:
            body = r.read()
        if b"<resultCode>0000</resultCode>" not in body:
            sys.exit(f"{fname}: 응답 오류 {body[:200]!r}")
        open(os.path.join(HERE, "raw", fname), "wb").write(body)
        print(f"{fname}: {len(body)} bytes")


if __name__ == "__main__":
    main()
