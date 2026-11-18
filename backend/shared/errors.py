class UpstreamError(Exception):
    """An upstream API responded, but with an error (e.g. an error message in a 200 body)."""
