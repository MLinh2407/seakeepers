"""
load_seed_data.py

Batch-loads seed_reports.csv into the DebrisReports DynamoDB table.

Prerequisites:
- AWS Academy Learner Lab session started, credentials configured locally
  (see the "AWS Details" panel in the Lab -> paste into ~/.aws/credentials
  under a profile, or set as environment variables before running).
- DebrisReports table already created in DynamoDB (region us-east-1).
- seed_reports.csv present at the path below (adjust if needed).

Usage:
    pip install boto3 pandas
    python load_seed_data.py
"""

from decimal import Decimal

import boto3
import pandas as pd
from dotenv import load_dotenv

CSV_PATH = "data/seed_reports.csv"
TABLE_NAME = "DebrisReports"
REGION = "us-east-1"

load_dotenv()

def to_dynamo_value(val):
    """Convert pandas/NumPy values into DynamoDB-safe Python types."""
    if pd.isna(val):
        return None
    if isinstance(val, float):
        # DynamoDB requires Decimal, not float, for numeric types
        return Decimal(str(val))
    return val


def main():
    df = pd.read_csv(CSV_PATH)
    print(f"Loaded {len(df)} rows from {CSV_PATH}")

    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    written = 0
    skipped = 0

    with table.batch_writer(overwrite_by_pkeys=["report_id"]) as batch:
        for _, row in df.iterrows():
            item = {}
            for col in df.columns:
                converted = to_dynamo_value(row[col])
                if converted is not None:
                    item[col] = converted

            # report_id is the partition key -- skip any row missing it
            if "report_id" not in item:
                skipped += 1
                continue

            batch.put_item(Item=item)
            written += 1

    print(f"Done. Written: {written}, skipped (missing report_id): {skipped}")


if __name__ == "__main__":
    main()