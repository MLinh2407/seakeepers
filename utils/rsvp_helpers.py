from config import RSVPS_TABLE
from utils.aws_clients import dynamodb

rsvps_table = dynamodb.Table(RSVPS_TABLE)


def rsvp_info(campaign_id, current_user_id=None):
    """RSVPs table: partition key campaign_id, sort key user_id -- this is
    a Query (fast, partition-key lookup), not a table scan."""
    result = rsvps_table.query(
        KeyConditionExpression="campaign_id = :cid",
        ExpressionAttributeValues={":cid": campaign_id},
    )
    user_ids = [item["user_id"] for item in result.get("Items", [])]
    return {
        "rsvp_count": len(user_ids),
        "user_has_rsvped": current_user_id in user_ids if current_user_id else False,
    }
