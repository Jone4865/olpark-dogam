"""웹앱이 읽는 데이터 파일을 만든다.

입력
  ../data/zones.geojson     장소 구역 (build_zones.py 결과)
  osm_olpark.json           배경 지도 (OpenStreetMap, ODbL)
  gallery_ok.tsv            생태갤러리 사진 (불러올 수 있는 것만)
  raw/rose_info.xml         올림픽공원 장미정보 API
  raw/rose_garden.xml       올림픽공원 장미광장 API
  lawn.csv                  잔디시설정보 (공공데이터포털 파일)
출력
  ../app/data/places.json   배지, 지점, 갤러리 사진, 잔디 개방 정보
  ../app/data/roses.json    장미광장 품종 카드
  ../app/data/basemap.json  배경 지도 SVG와 좌표 변환 값

실행: python3 -I tools/build_app_data.py
"""
import csv
import json
import math
import os
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "app", "data")

L0, G0 = 37.5180, 127.1220
KX = 111320 * math.cos(math.radians(L0))
KY = 110574

DESC = {
    "v1": "1988 서울올림픽을 기념해 세운, 공원 서쪽 입구의 커다란 문이에요.",
    "v2": "프랑스 조각가 세자르의 엄지손가락 조각이에요.",
    "v3": "몽촌토성을 둘러싼 물길이에요. 음악분수와 곰말다리가 있어요.",
    "v4": "공원 남쪽 잔디밭의 조각 작품 「대화」예요.",
    "v5": "백제 때 흙으로 쌓은 몽촌토성 위를 걷는 길이에요.",
    "v6": "넓은 잔디 언덕에 홀로 서 있는 나무예요.",
    "v7": "공원 북쪽의 호수예요. 물가에 수변무대가 있어요.",
    "v8": "계절마다 다른 들꽃이 피는 언덕 꽃밭이에요.",
    "v9": "올림포스 12신을 주제로 꾸민 장미 정원이에요.",
    "t_tree": "보호수를 비롯해 공원의 이름난 나무 다섯 그루예요.",
    "t_lawn": "잔디를 여는 장소들이에요. 잔디 보호 기간에는 잔디 밖에서 찍어 주세요.",
    "t_art": "공원 곳곳에 놓인 조각 작품이에요.",
    "t_wild": "야생화를 가까이서 볼 수 있는 학습장이에요.",
    "t_walk": "공원 안 어디서든 계절 사진을 모을 수 있어요.",
}

# 잔디시설정보의 장소 이름 → 지점 이름
LAWN_SPOT = {"88마당": "88잔디마당", "지구촌공원": "지구촌공원", "피크닉장": "피크닉장",
             "가족놀이동산": "가족놀이동산", "나홀로나무": "나홀로나무"}


def en(lat, lon):
    return ((lon - G0) * KX, (lat - L0) * KY)


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = math.hypot(p[0] - a[0], p[1] - a[1]) if L < 1e-9 else abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return dp(pts[:idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [a, b]


def area(pts):
    return abs(sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))) / 2


def geom_points(g):
    t = g["type"]
    if t == "Point":
        return [g["coordinates"]]
    if t == "LineString":
        return g["coordinates"]
    if t == "Polygon":
        return g["coordinates"][0]
    return [c for poly in g["coordinates"] for c in poly[0]]


def main():
    zones = json.load(open(os.path.join(ROOT, "data", "zones.geojson"), encoding="utf-8"))
    osm = json.load(open(os.path.join(HERE, "osm_olpark.json"), encoding="utf-8"))

    # ---- 배경 지도 ----
    park = next(f for f in zones["features"] if f["properties"]["badge_id"] == "t_walk")["geometry"]
    ring = park["coordinates"][0] if park["type"] == "Polygon" else max((p[0] for p in park["coordinates"]), key=len)
    pm = [en(c[1], c[0]) for c in ring]
    minx = min(p[0] for p in pm) - 30; maxx = max(p[0] for p in pm) + 30
    miny = min(p[1] for p in pm) - 30; maxy = max(p[1] for p in pm) + 30
    W = 1000
    s = W / (maxx - minx)
    H = round((maxy - miny) * s)

    def P(lat, lon):
        x, y = en(lat, lon)
        return ((x - minx) * s, (maxy - y) * s)

    def path(pts, closed, eps=1.2):
        q = dp(pts, eps)
        return "M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in q) + ("Z" if closed else "")

    layers = {"park": [], "grass": [], "water": [], "river": [], "bld": [], "path": []}
    layers["park"].append(path([P(c[1], c[0]) for c in ring], True))
    for e in osm["background"]:
        t = e.get("tags", {})
        g = e["geometry"]
        closed = e["nodes"][0] == e["nodes"][-1]
        pts = [P(p["lat"], p["lon"]) for p in g]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        if max(xs) < 0 or min(xs) > W or max(ys) < 0 or min(ys) > H:
            continue
        a = area(pts) if closed else 0
        if t.get("natural") == "water" and closed and a > 30:
            layers["water"].append(path(pts, True))
        elif t.get("waterway") in ("river", "stream", "canal"):
            layers["river"].append(path(pts, False))
        elif closed and a > 150 and (t.get("landuse") in ("grass", "forest") or t.get("natural") in ("grassland", "wood", "scrub")):
            layers["grass"].append(path(pts, True))
        elif closed and a > 250 and ("building" in t or t.get("leisure") == "stadium"):
            layers["bld"].append(path(pts, True))
        elif t.get("highway") in ("footway", "path", "pedestrian", "cycleway"):
            layers["path"].append(path(pts, False, 1.8))
    moat = []
    for e in osm["elements"]:
        if e["type"] == "relation" and e.get("tags", {}).get("natural") == "water":
            for m in e["members"]:
                if m.get("role") == "outer" and m.get("geometry"):
                    moat.append(path([P(p["lat"], p["lon"]) for p in m["geometry"]], False))
    svg = (
        f'<path d="{"".join(layers["park"])}" fill="#E4EEDC" stroke="#9DB38C" stroke-width="3"/>'
        f'<path d="{"".join(layers["grass"])}" fill="#CFE2BF"/>'
        f'<path d="{"".join(layers["path"])}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>'
        f'<path d="{"".join(layers["river"])}" fill="none" stroke="#BFDCEE" stroke-width="12" stroke-linecap="round"/>'
        f'<path d="{"".join(layers["water"])}" fill="#BFDCEE"/>'
        f'<path d="{"".join(moat)}" fill="none" stroke="#BFDCEE" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>'
        f'<path d="{"".join(layers["bld"])}" fill="#DAD8D2"/>'
    )
    basemap = {"w": W, "h": H, "proj": {"lat0": L0, "lon0": G0, "kx": KX, "ky": KY, "minx": minx, "maxy": maxy, "s": s},
               "svg": svg, "attribution": "© OpenStreetMap contributors"}

    # ---- 갤러리 사진 ----
    gal = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "gallery_ok.tsv"), encoding="utf-8") if l.strip()]
    badge_kws = {b["id"]: None for b in zones["badges"]}
    # build_zones.py와 같은 순서·키워드로 배정
    import importlib.util
    spec = importlib.util.spec_from_file_location("bz", os.path.join(HERE, "build_zones.py"))
    bz = importlib.util.module_from_spec(spec); spec.loader.exec_module(bz)
    used = set()
    gallery = {}
    for bid, bname, group, spots, kws in bz.BADGES:
        items = []
        for no, date, title, url in gal:
            if no in used or not any(k in title for k in kws):
                continue
            used.add(no)
            season = next((sn for sn, ks in (("봄", ("봄", "벚", "벗꽃", "4월", "복사꽃", "산수유")), ("여름", ("여름", "해바라기")),
                                               ("가을", ("가을", "낙엽", "코스모스", "허수아비", "은행")), ("겨울", ("겨울", "눈", "철새")))
                           if any(k in title for k in ks)), "")
            items.append({"no": no, "title": title, "date": date, "season": season, "url": url})
        gallery[bid] = items

    # ---- 잔디 ----
    lawn = {}
    closed_period = None
    with open(os.path.join(HERE, "lawn.csv"), encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            name, val = row["장소"].strip(), row["개방내용"].strip()
            if name == "잔디통제시기":
                closed_period = val
            elif name in LAWN_SPOT:
                lawn[LAWN_SPOT[name]] = val

    # ---- 배지·지점 ----
    badges, spots = [], []
    for b in zones["badges"]:
        badges.append({"id": b["id"], "name": b["name"], "group": b["group"], "desc": DESC[b["id"]],
                       "spots": b["spots"], "gallery": gallery.get(b["id"], [])})
    for f in zones["features"]:
        p = f["properties"]
        pts = geom_points(f["geometry"])
        clat = sum(c[1] for c in pts) / len(pts); clon = sum(c[0] for c in pts) / len(pts)
        if f["geometry"]["type"] == "Point":
            clon, clat = f["geometry"]["coordinates"]
        x, y = P(clat, clon)
        spot = {"id": p["spot_id"], "badge": p["badge_id"], "name": p["spot"], "geom": f["geometry"],
                "reach": p.get("radius_m", p.get("buffer_m", 0)), "c": [round(x, 1), round(y, 1)]}
        if p["spot"] in lawn:
            spot["lawn"] = {"open": lawn[p["spot"]], "seasonal": lawn[p["spot"]] != "연중 상시개방"}
        spots.append(spot)

    places = {
        "generated": "2026-11-10",
        "rules": zones["rules"],
        "lawnClosed": closed_period,
        "badges": badges,
        "spots": spots,
        "sources": [
            {"name": "올림픽공원 생태공원 갤러리 (사진)", "by": "한국체육산업개발(주)", "license": "공공누리 제4유형(출처표시, 상업적 이용금지, 변경금지)"},
            {"name": "올림픽공원장미정보, 올림픽공원장미광장 (오픈API)", "by": "한국체육산업개발(주), 문화공공데이터광장", "license": "이용허락범위 제한 없음"},
            {"name": "잔디시설정보 (파일데이터)", "by": "한국체육산업개발(주), 공공데이터포털", "license": "이용허락범위 제한 없음"},
            {"name": "지도와 장소 경계", "by": "© OpenStreetMap contributors", "license": "ODbL 1.0"},
        ],
    }

    # ---- 장미 ----
    info = {}
    for it in ET.parse(os.path.join(HERE, "raw", "rose_info.xml")).getroot().iter("item"):
        name = (it.findtext("title") or "").strip()
        if name and name not in info:
            info[name] = {"name": name, "desc": (it.findtext("description") or "").strip(), "img": (it.findtext("url") or "").strip()}
    garden = []
    for it in ET.parse(os.path.join(HERE, "raw", "rose_garden.xml")).getroot().iter("item"):
        name = (it.findtext("title") or "").strip()
        if name and name in info and name not in garden:
            garden.append(name)
    roses = [info[n] for n in garden]

    os.makedirs(OUT, exist_ok=True)
    json.dump(places, open(os.path.join(OUT, "places.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(roses, open(os.path.join(OUT, "roses.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(basemap, open(os.path.join(OUT, "basemap.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"배지 {len(badges)}, 지점 {len(spots)}, 갤러리 {sum(len(v) for v in gallery.values())}장, 장미 {len(roses)}종, 지도 {W}x{H}")
    print("잔디:", lawn, "통제:", closed_period)
    for name in ("places.json", "roses.json", "basemap.json"):
        print(name, os.path.getsize(os.path.join(OUT, name)), "bytes")


if __name__ == "__main__":
    main()
