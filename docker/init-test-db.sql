-- Runs once, the first time the Postgres container starts.
-- Creates a separate database so tests never touch development data.
CREATE DATABASE eduzen_test;
