import os

from dotenv import load_dotenv

load_dotenv()

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
USERS_TABLE = os.environ.get("DYNAMODB_USERS_TABLE", "Users")
REPORTS_TABLE = os.environ.get("DYNAMODB_REPORTS_TABLE", "DebrisReports")
CAMPAIGNS_TABLE = os.environ.get("DYNAMODB_CAMPAIGNS_TABLE", "Campaigns")
RSVPS_TABLE = os.environ.get("DYNAMODB_RSVPS_TABLE", "RSVPs")
NOTIFICATIONS_TABLE = os.environ.get("DYNAMODB_NOTIFICATIONS_TABLE", "Notifications")

# S3 buckets
PHOTOS_BUCKET = os.environ.get("S3_PHOTOS_BUCKET", "seakeepers-debris-photos")
DATA_BUCKET = os.environ.get("S3_DATA_BUCKET", "seakeepers-noaa-data")

# Flask session signing key
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me")

# Third-party APIs
OPENWEATHERMAP_API_KEY = os.environ.get("OPENWEATHERMAP_API_KEY", "")
NOMINATIM_USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT", "SeaKeepers-RMIT-Assignment3"
)

# ElastiCache (Redis) 
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_ENABLED = os.environ.get("REDIS_ENABLED", "true").lower() != "false"

# Athena / Glue 
ATHENA_DATABASE = os.environ.get("ATHENA_DATABASE", "seakeepers_catalog")
ATHENA_TABLE = os.environ.get("ATHENA_TABLE", "seakeepers_noaa_data_s4146535")
ATHENA_OUTPUT_LOCATION = os.environ.get(
    "ATHENA_OUTPUT_LOCATION", "s3://seakeepers-athena-results/"
)
