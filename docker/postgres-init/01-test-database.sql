-- Separate database for the e2e suite, so tests never touch dev data.
CREATE DATABASE artifact_hub_test OWNER artifact_hub;
