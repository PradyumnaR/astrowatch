"""
One-off script to issue a test API key, standing in for the Developer
page's "New key" button, which doesn't exist until Phase C.

Run from backend/: python -m scripts.issue_test_key satellite

Does exactly what the eventual POST /api/mcp-keys route will do:
generate a raw key, hash it, insert the hash into mcp_api_keys, print
the raw key ONCE (it's never retrievable again after this).
"""

import secrets
import sys

from dotenv import load_dotenv

load_dotenv()

from mcp_servers.auth import _hash_key, _supabase  # reuse the exact same hashing logic

VALID_SERVERS = {"satellite", "weather", "knowledge", "calendar"}


def issue_key(server_name: str, clerk_user_id: str = "test_user_local_dev") -> str:
    if server_name not in VALID_SERVERS:
        raise ValueError(f"server_name must be one of {VALID_SERVERS}")

    raw_key = f"sk-aw-{server_name[:3]}-{secrets.token_hex(16)}"
    key_hash = _hash_key(raw_key)

    _supabase.table("mcp_api_keys").insert(
        {
            "clerk_user_id": clerk_user_id,
            "server_name": server_name,
            "key_hash": key_hash,
            "label": "local dev test key",
        }
    ).execute()

    return raw_key


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in VALID_SERVERS:
        print(f"Usage: python -m scripts.issue_test_key <{'|'.join(VALID_SERVERS)}>")
        sys.exit(1)

    key = issue_key(sys.argv[1])
    print(f"\nRaw key (save this now, it won't be shown again):\n{key}\n")
