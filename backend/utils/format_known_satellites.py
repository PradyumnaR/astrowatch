KNOWN_SATELLITES = {
    "iss": 25544,
    "international space station": 25544,
    "tiangong": 48274,
    "chinese space station": 48274,
    "noaa-19": 33591,
    "noaa 19": 33591,
    "noaa-15": 25338,
    "noaa 15": 25338,
    "hubble": 20580,
    "hubble space telescope": 20580,
}


def format_known_satellites() -> str:
    # dedupe by norad_id so "iss" and "international space station"
    # don't both print as separate lines
    seen_ids: dict[int, str] = {}
    for name, norad_id in KNOWN_SATELLITES.items():
        if norad_id not in seen_ids or len(name) > len(seen_ids[norad_id]):
            seen_ids[norad_id] = name
    return ", ".join(f"{name.title()} = {nid}" for nid, name in seen_ids.items())
