"""Helper to raise a uniform 'not implemented yet' response for contract stubs."""
from fastapi import HTTPException, status


def not_implemented(phase: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Contract stub - implemented in {phase}.",
    )
