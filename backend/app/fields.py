"""Reusable input rules. Pydantic rejects bad input with a 422 before route code runs."""

from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, EmailStr, StringConstraints

# Valid email format, stored lowercase so "Asha@SVMIT.edu" and "asha@svmit.edu" match.
NormalizedEmail = Annotated[EmailStr, AfterValidator(str.lower)]

# Length is the most useful password rule. The maximum stops someone sending a
# huge string to make argon2 burn CPU.
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]

# Names: no blank strings, no leading or trailing spaces.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


def _strip_and_lower(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


# Organisation slug used in URLs: lowercase letters, digits and single hyphens, e.g. "svmit".
# Lowercased *before* the pattern check, so "SVMIT" is accepted as "svmit".
Slug = Annotated[
    str,
    BeforeValidator(_strip_and_lower),
    StringConstraints(min_length=3, max_length=50, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"),
]
