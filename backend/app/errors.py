"""Errors raised by services. Routes turn them into HTTP responses."""


class ConflictError(Exception):
    """Something with the same unique value already exists (e.g. email or slug)."""
