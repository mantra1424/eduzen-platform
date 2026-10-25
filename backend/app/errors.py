"""Errors raised by services. Routes turn them into HTTP responses."""


class ConflictError(Exception):
    """Something with the same unique value already exists (e.g. email or slug)."""


class ForbiddenError(Exception):
    """The caller is known but not allowed to do this (HTTP 403)."""


class NotFoundError(Exception):
    """The thing doesn't exist, or isn't visible to the caller (HTTP 404)."""
