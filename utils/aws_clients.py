import boto3

from config import AWS_REGION

# Reused across all route modules so we don't reconnect per-request
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)
