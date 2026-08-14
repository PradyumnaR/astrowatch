"""
Verifies incoming requests actually carry a genuine, signed Clerk
session token — rather than trusting a bare clerk_user_id string
asserted in the request body.

Used as a FastAPI dependency: any route that needs to know WHO is
calling (not just that some request arrived) should depend on
require_user, which returns the verified clerk_user_id (the JWT's
`sub` claim) or raises 401.

Verification is networkless — CLERK_JWT_KEY is Clerk's public key, so
this is a local signature check, not a call out to Clerk's API on
every request.
"""

import os

from fastapi import HTTPException, Request
from clerk_backend_api import authenticate_request, AuthenticateRequestOptions


def require_user(request: Request) -> str:
    state = authenticate_request(
        request,
        AuthenticateRequestOptions(
            secret_key=os.environ["CLERK_SECRET_KEY"],
            jwt_key=os.environ["CLERK_JWT_KEY"],
            authorized_parties=os.environ["CLERK_AUTHORIZED_PARTIES"].split(","),
            accepts_token=["session_token"],
        ),
    )

    print(state)

    if not state.is_signed_in:
        raise HTTPException(
            status_code=401,
            detail=state.reason.name if state.reason else "Unauthorized",
        )

    payload = state.payload
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")

    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return sub
