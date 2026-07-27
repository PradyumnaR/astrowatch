from typing import get_type_hints, get_origin, get_args, Annotated


def get_reducer_fields(state_cls) -> dict:
    hints = get_type_hints(state_cls, include_extras=True)
    reducers = {}
    for field_name, hint in hints.items():
        if get_origin(hint) is Annotated:
            for extra in get_args(hint)[1:]:
                if callable(extra):
                    reducers[field_name] = extra
    return reducers
