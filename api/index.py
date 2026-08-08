"""Vercel serverless entry point.

Vercel turns any file under /api into a Python function. The real application
lives in backend/ so it stays runnable locally with uvicorn; this module just puts
that folder on sys.path and re-exports the FastAPI app.

vercel.json rewrites every /api/* request here, and FastAPI routes it from there.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from server import app  # noqa: E402  (import must follow the sys.path tweak)

__all__ = ["app"]
