import os

from dotenv import load_dotenv

# Loads .env into the process environment. Locally this picks up your .env
# file. On Elastic Beanstalk there's no .env file (it's gitignored and never
# deployed) — load_dotenv() just becomes a no-op there, and the values you
# set via `eb setenv` are already in the environment directly.
load_dotenv()

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# DynamoDB table names — names match your .env
USERS_TABLE = os.environ.get("DYNAMODB_USERS_TABLE", "Users")
REPORTS_TABLE = os.environ.get("DYNAMODB_REPORTS_TABLE", "DebrisReports")
CAMPAIGNS_TABLE = os.environ.get("DYNAMODB_CAMPAIGNS_TABLE", "Campaigns")
RSVPS_TABLE = os.environ.get("DYNAMODB_RSVPS_TABLE", "RSVPs")

# S3 buckets — names match your .env
PHOTOS_BUCKET = os.environ.get("S3_PHOTOS_BUCKET", "seakeepers-debris-photos-s4146535")
DATA_BUCKET = os.environ.get("S3_DATA_BUCKET", "seakeepers-noaa-data-s4146535")

# Flask session signing key — MUST be overridden via env var in production, never commit a real one
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me")

# Third-party APIs — not used until Phase 3, defined here now so config.py
# stays the single source of truth for all env-driven settings
OPENWEATHERMAP_API_KEY = os.environ.get("OPENWEATHERMAP_API_KEY", "")
NOMINATIM_USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT", "SeaKeepers-RMIT-Assignment3"
)
