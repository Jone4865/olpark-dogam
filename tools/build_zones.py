"""올팍 도감 수집 구역 파일 만들기

입력
  osm_olpark.json      OpenStreetMap에서 추린 장소 경계 (ODbL)
  georef_points.tsv    공식 안내도 좌표 → 실제 위도·경도 기준점
  gallery_titles.tsv   생태갤러리 사진 제목 (배지별 사진 수 세기용)
출력
  ../data/zones.geojson       장소(지점)별 구역
  ../data/zones_preview.svg   검수용 그림

실행: python3 -I build_zones.py
"""
import json, math, os, sys
from itertools import combinations

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from georef import Model, load, en, ll  # noqa: E402

OSM = json.load(open(os.path.join(HERE, "osm_olpark.json"), encoding="utf-8"))
BY = {f"{e['type'][0]}{e['id']}": e for e in OSM["elements"]}
for e in OSM["elements"]:
    if e.get("tags", {}).get("name") == "88서울올림픽":
        BY["88조각"] = e
MAP = Model(load(os.path.join(HERE, "georef_points.tsv")), sigma=60)

# 판정 규칙 (앱이 그대로 씀)
RULES = {
    "gps_max_accuracy_m": 50,      # 이보다 오차가 크면 판정 보류
    "candidate": "거리(현재 위치, 구역 도형) <= 여유(buffer_m 또는 radius_m) + 폰이 알려 준 오차(accuracy)",
    "multiple_candidates": "가까운 순으로 보여 주고 사용자가 고른다. 사진 1장은 지점 1곳만 채운다.",
    "no_permission": "위치 권한이 없으면 도감 구경만 가능",
}

# 배지와 지점
#  osm: OSM 요소 번호 / map: 공식 안내도 좌표(SVG 단위, 953x677) / poly: 안내도 다각형
BADGES = [
    ("v1", "1경 세계평화의문", "9경", [
        ("세계평화의문", {"osm": "r16563734", "buffer": 25}),
        ("평화의광장", {"osm": "w473971980", "buffer": 15}),
    ], ["세계평화의문", "평화의광장", "국기광장", "한얼광장"]),
    ("v2", "2경 엄지손가락", "9경", [
        ("엄지손가락", {"osm": "n11881174993", "radius": 40}),
    ], ["엄지"]),
    ("v3", "3경 몽촌해자", "9경", [
        ("몽촌해자", {"osm": "r6968154", "buffer": 25}),
        ("곰말다리", {"osm": "w75542628", "buffer": 20}),
        ("음악분수", {"map": (285, 477.5), "radius": 40}),
        ("몽촌폭포와 물레방아", {"map": (333, 535), "radius": 45}),
    ], ["몽촌해자", "음악분수", "곰말다리", "물레방아"]),
    ("v4", "4경 대화", "9경", [
        ("대화(조각)", {"map": (416, 542), "radius": 40}),
    ], ["대화"]),
    ("v5", "5경 몽촌토성 산책로", "9경", [
        ("몽촌토성 산책로", {"map": (330, 456), "radius": 60}),
        ("내성농장", {"osm": "w620998340", "buffer": 20}),
        ("백제집자리전시관", {"osm": "w76425868", "buffer": 20}),
    ], ["몽촌토성", "몽촌뜰", "내성농장", "허수아비", "목책"]),
    ("v6", "6경 나홀로나무", "9경", [
        ("나홀로나무", {"osm": "n3739451104", "radius": 70}),
    ], ["나홀로나무"]),
    ("v7", "7경 88호수", "9경", [
        ("88호수", {"osm": "w222074696", "buffer": 30}),
        ("88호수 수변무대", {"osm": "w609827759", "buffer": 20}),
    ], ["88호수"]),
    ("v8", "8경 들꽃마루", "9경", [
        ("들꽃마루", {"poly": [(642.5, 617.5), (665, 604.5), (817.5, 604.5), (820.5, 617.5), (817.5, 632), (665, 633)], "buffer": 20}),
    ], ["들꽃마루", "원두막", "해바라기"]),
    ("v9", "9경 장미광장", "9경", [
        ("장미광장", {"map": (866, 592), "radius": 70}),
    ], ["장미", "가상의 구"]),
    ("t_tree", "명품 나무", "테마", [
        ("은행나무 보호수", {"map": (235, 185), "radius": 40}),
        ("느티나무 보호수", {"map": (442.5, 512.5), "radius": 40}),
        ("처진개벚나무", {"map": (506, 104), "radius": 40}),
        ("소나무(정이품송 장자목)", {"map": (509, 357.5), "radius": 40}),
        ("연리목(사랑나무)", {"map": (707.5, 401), "radius": 40}),
    ], ["은행나무"]),
    ("t_lawn", "잔디마당", "테마", [
        ("88잔디마당", {"osm": "w469354406", "buffer": 10}),
        ("피크닉장", {"map": (297.5, 150), "radius": 80}),
        ("가족놀이동산", {"map": (335, 299), "radius": 60}),
        ("지구촌공원", {"map": (454.5, 577.5), "radius": 50}),
        ("소마미술관 잔디", {"osm": "r6185424", "buffer": 20}),
    ], ["88마당", "만남의 광장", "피크닉"]),
    ("t_art", "조각 산책", "테마", [
        ("88서울올림픽(조각)", {"osm": "88조각", "buffer": 25}),
        ("하늘기둥(조각)", {"map": (444, 552), "radius": 30}),
        ("조각공원", {"map": (410, 605), "radius": 70}),
    ], ["조각", "날개짓"]),
    ("t_wild", "야생화학습장", "테마", [
        ("야생화학습장", {"osm": "w473352558", "buffer": 15}),
    ], ["야생화"]),
    ("t_walk", "공원 산책", "어디서나", [
        ("올림픽공원 전체", {"osm": "r6185423", "buffer": 0}),
    ], ["산책", "낙엽", "벚꽃", "벗꽃", "산수유", "복사꽃", "공원의", "올림픽공원의", "올림픽공원 전경", "올림픽공원 풍경"]),
]


def rings_from_relation(e):
    """멀티폴리곤 outer 길을 이어 고리로 만든다 (inner는 무시)."""
    segs = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if cur[0] != cur[-1]:
            cur.append(cur[0])
        rings.append(cur)
    return rings


def osm_geometry(ref):
    e = BY[ref]
    if e["type"] == "node":
        return {"type": "Point", "coordinates": [e["lon"], e["lat"]]}
    if e["type"] == "way":
        pts = [[p["lon"], p["lat"]] for p in e["geometry"]]
        if e["nodes"][0] == e["nodes"][-1]:
            return {"type": "Polygon", "coordinates": [pts]}
        return {"type": "LineString", "coordinates": pts}
    rings = rings_from_relation(e)
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": [[list(p) for p in rings[0]]]}
    return {"type": "MultiPolygon", "coordinates": [[[list(p) for p in r]] for r in rings]}


def map_point(x, y):
    lat, lon = MAP.ll(x, y)
    return [round(lon, 6), round(lat, 6)]


def r6(c):
    return [round(c[0], 6), round(c[1], 6)]


def round_geom(g):
    t = g["type"]
    if t == "Point":
        return {"type": t, "coordinates": r6(g["coordinates"])}
    if t == "LineString":
        return {"type": t, "coordinates": [r6(c) for c in g["coordinates"]]}
    if t == "Polygon":
        return {"type": t, "coordinates": [[r6(c) for c in ring] for ring in g["coordinates"]]}
    return {"type": t, "coordinates": [[[r6(c) for c in ring] for ring in poly] for poly in g["coordinates"]]}


# ---- 거리 계산 (평면 근사, 미터) ----
def to_m(c):
    return en(c[1], c[0])


def parts(g):
    """도형을 (점들, 닫힘 여부) 목록으로."""
    t = g["type"]
    if t == "Point":
        return [([to_m(g["coordinates"])], False)]
    if t == "LineString":
        return [([to_m(c) for c in g["coordinates"]], False)]
    if t == "Polygon":
        return [([to_m(c) for c in g["coordinates"][0]], True)]
    return [([to_m(c) for c in poly[0]], True) for poly in g["coordinates"]]


def seg_dist(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def inside(p, ring):
    x, y = p; c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def dist_point_geom(p, g):
    best = 1e18
    for pts, closed in parts(g):
        if closed and inside(p, pts):
            return 0.0
        if len(pts) == 1:
            best = min(best, math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]))
        for a, b in zip(pts, pts[1:]):
            best = min(best, seg_dist(p, a, b))
    return best


def dist_geom_geom(g1, g2):
    best = 1e18
    for pts, _ in parts(g1):
        for p in pts:
            best = min(best, dist_point_geom(p, g2))
    for pts, _ in parts(g2):
        for p in pts:
            best = min(best, dist_point_geom(p, g1))
    return best


def main():
    titles = []
    tpath = os.path.join(HERE, "gallery_titles.tsv")
    if os.path.exists(tpath):
        titles = [l.rstrip("\n").split("\t")[-1] for l in open(tpath, encoding="utf-8") if l.strip()]

    features, badges, used_titles = [], [], set()
    for bid, bname, group, spots, kws in BADGES:
        hits = [t for t in titles if t not in used_titles and any(k in t for k in kws)]
        used_titles.update(hits)
        badges.append({"id": bid, "name": bname, "group": group, "spots": [f"{bid}-{i+1}" for i in range(len(spots))], "gallery_photos": len(hits)})
        for i, (sname, spec) in enumerate(spots):
            if "osm" in spec:
                g = osm_geometry(spec["osm"])
                e = BY[spec["osm"]]
                src = f"OpenStreetMap {e['type']}/{e['id']}"
                check = False
            elif "map" in spec:
                g = {"type": "Point", "coordinates": map_point(*spec["map"])}
                src = "올림픽공원 공식 안내도"
                check = True
            else:
                ring = [map_point(x, y) for x, y in spec["poly"]]
                ring.append(ring[0])
                g = {"type": "Polygon", "coordinates": [ring]}
                src = "올림픽공원 공식 안내도"
                check = True
            props = {"spot_id": f"{bid}-{i+1}", "spot": sname, "badge_id": bid, "badge": bname, "group": group,
                     "source": src, "field_check": check}
            if "radius" in spec:
                if g["type"] != "Point":
                    raise SystemExit(f"{sname}: radius는 점에만 씀")
                props["radius_m"] = spec["radius"]
            else:
                props["buffer_m"] = spec["buffer"]
            features.append({"type": "Feature", "properties": props, "geometry": round_geom(g)})

    # 겹치는 지점 찾기 (같은 배지끼리는 제외, '공원 산책'은 제외)
    overlaps = []
    for a, b in combinations(features, 2):
        pa, pb = a["properties"], b["properties"]
        if pa["badge_id"] == pb["badge_id"] or "t_walk" in (pa["badge_id"], pb["badge_id"]):
            continue
        d = dist_geom_geom(a["geometry"], b["geometry"])
        reach = pa.get("radius_m", pa.get("buffer_m", 0)) + pb.get("radius_m", pb.get("buffer_m", 0))
        if d < reach + 50:  # GPS 오차 최대 50m까지 감안
            overlaps.append({"a": pa["spot"], "b": pb["spot"], "gap_m": round(d - reach), "always_overlap": d < reach})
    overlaps.sort(key=lambda o: o["gap_m"])

    out = {
        "type": "FeatureCollection",
        "name": "올팍 도감 수집 구역",
        "generated": "2026-11-10",
        "attribution": [
            "장소 경계 일부: © OpenStreetMap contributors (ODbL 1.0). 이 파일도 ODbL로 공개한다.",
            "장소 위치 일부: 한국체육산업개발(주) 올림픽공원 공식 안내도를 보고 직접 정함 (field_check=true, 현장 확인 필요).",
        ],
        "rules": RULES,
        "badges": badges,
        "overlaps": overlaps,
        "features": features,
    }
    os.makedirs(os.path.join(HERE, "..", "data"), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, "..", "data", "zones.geojson"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_preview(features)

    n_check = sum(f["properties"]["field_check"] for f in features)
    print(f"배지 {len(badges)}개, 지점 {len(features)}곳 (안내도 기준 {n_check}곳)")
    for b in badges:
        print(f"  {b['name']}: 지점 {len(b['spots'])}곳, 갤러리 사진 {b['gallery_photos']}장")
    print(f"사진 배정 {len(used_titles)}/{len(titles)}장")
    print("겹침(GPS 오차 감안):")
    for o in overlaps:
        print(f"  {o['a']} ↔ {o['b']}: {'항상 겹침' if o['always_overlap'] else '오차 크면 겹침'} (간격 {o['gap_m']}m)")


def write_preview(features):
    bg = OSM["background"]
    allpts = [to_m((p["lon"], p["lat"])) for e in bg for p in e["geometry"]]
    park = next(f for f in features if f["properties"]["badge_id"] == "t_walk")["geometry"]
    pp = [p for pts, _ in parts(park) for p in pts]
    minx = min(p[0] for p in pp) - 60; maxx = max(p[0] for p in pp) + 60
    miny = min(p[1] for p in pp) - 60; maxy = max(p[1] for p in pp) + 60
    W = maxx - minx; H = maxy - miny
    def X(p): return f"{p[0]-minx:.1f},{maxy-p[1]:.1f}"
    def path(pts, closed): return "M" + " L".join(X(p) for p in pts) + (" Z" if closed else "")
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W*0.9:.0f}" height="{H*0.9:.0f}" font-family="Apple SD Gothic Neo, Noto Sans KR, sans-serif">',
           f'<rect width="{W:.0f}" height="{H:.0f}" fill="#f4f2ec"/>']
    for pts, closed in parts(park):
        out.append(f'<path d="{path(pts, True)}" fill="#e8efe0" stroke="#9aa88a" stroke-width="2"/>')
    for e in bg:
        t = e.get("tags", {}); pts = [to_m((p["lon"], p["lat"])) for p in e["geometry"]]
        closed = e["nodes"][0] == e["nodes"][-1]
        if t.get("natural") == "water" or t.get("waterway"):
            out.append(f'<path d="{path(pts, closed)}" fill="{"#bcd7ea" if closed else "none"}" stroke="#8fb8d6" stroke-width="{1 if closed else 4}"/>')
        elif t.get("landuse") in ("grass", "forest") or t.get("natural") in ("grassland", "wood", "scrub") or t.get("leisure") in ("park", "pitch", "playground"):
            if closed:
                out.append(f'<path d="{path(pts, True)}" fill="#cfe3bd" stroke="none"/>')
        elif "building" in t or t.get("leisure") == "stadium":
            if closed:
                out.append(f'<path d="{path(pts, True)}" fill="#d6d3cc" stroke="#b9b5ab" stroke-width="0.8"/>')
    for e in bg:
        t = e.get("tags", {})
        if t.get("highway") in ("footway", "path", "pedestrian", "cycleway", "service"):
            pts = [to_m((p["lon"], p["lat"])) for p in e["geometry"]]
            out.append(f'<path d="{path(pts, False)}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>')
    palette = {"9경": "#d9480f", "테마": "#1c7ed6"}
    labels = []
    for f in features:
        p = f["properties"]
        if p["badge_id"] == "t_walk":
            continue
        col = palette[p["group"]]
        dash = ' stroke-dasharray="6 4"' if p["field_check"] else ""
        g = f["geometry"]
        if g["type"] == "Point":
            c = to_m(g["coordinates"]); r = p["radius_m"]
            out.append(f'<circle cx="{c[0]-minx:.1f}" cy="{maxy-c[1]:.1f}" r="{r}" fill="{col}" fill-opacity="0.18" stroke="{col}" stroke-width="2"{dash}/>')
            out.append(f'<circle cx="{c[0]-minx:.1f}" cy="{maxy-c[1]:.1f}" r="3" fill="{col}"/>')
            labels.append((c, p["spot"], col))
        else:
            b = p["buffer_m"]
            for pts, closed in parts(g):
                d = path(pts, closed)
                out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity="0.18" stroke-width="{2*b}" stroke-linejoin="round" stroke-linecap="round"/>')
                out.append(f'<path d="{d}" fill="{col if closed else "none"}" fill-opacity="0.18" stroke="{col}" stroke-width="2"{dash}/>')
            cx = sum(q[0] for pts, _ in parts(g) for q in pts) / sum(len(pts) for pts, _ in parts(g))
            cy = sum(q[1] for pts, _ in parts(g) for q in pts) / sum(len(pts) for pts, _ in parts(g))
            labels.append(((cx, cy), p["spot"], col))
    for c, name, col in labels:
        out.append(f'<text x="{c[0]-minx+6:.1f}" y="{maxy-c[1]-6:.1f}" font-size="15" font-weight="700" fill="{col}" stroke="#fff" stroke-width="4" paint-order="stroke">{name}</text>')
    out.append(f'<g font-size="14" fill="#333"><rect x="12" y="12" width="330" height="92" fill="#fff" fill-opacity="0.9" stroke="#ccc"/>'
               f'<circle cx="30" cy="34" r="7" fill="#d9480f" fill-opacity="0.4" stroke="#d9480f"/><text x="44" y="39">9경 배지 지점</text>'
               f'<circle cx="30" cy="58" r="7" fill="#1c7ed6" fill-opacity="0.4" stroke="#1c7ed6"/><text x="44" y="63">테마 배지 지점</text>'
               f'<line x1="22" y1="82" x2="40" y2="82" stroke="#555" stroke-width="2" stroke-dasharray="6 4"/><text x="44" y="87">점선: 안내도 기준, 현장 확인 필요</text></g>')
    out.append(f'<text x="{W-12:.0f}" y="{H-12:.0f}" text-anchor="end" font-size="12" fill="#666">배경 © OpenStreetMap contributors · 위쪽이 북쪽</text>')
    out.append("</svg>")
    open(os.path.join(HERE, "..", "data", "zones_preview.svg"), "w", encoding="utf-8").write("\n".join(out))


if __name__ == "__main__":
    main()
