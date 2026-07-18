from agents.models import Location


def format_location(location: Location) -> str:
    """
    Format location as human readable string
    with correct N/S/E/W direction indicators.

    Examples:
      Burbank, CA  (34.18°N, 118.31°W)
      Sydney, AU   (33.86°S, 151.20°E)
      Tokyo, JP    (35.68°N, 139.69°E)
    """

    lat_dir = "N" if location.lat >= 0 else "S"
    lng_dir = "E" if location.lng >= 0 else "W"
    return (
        f"{location.name} "
        f"({abs(location.lat):.2f}°{lat_dir}, "
        f"{abs(location.lng):.2f}°{lng_dir})"
    )
