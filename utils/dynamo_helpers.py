def scan_all(table, **kwargs):
    """Fully paginated DynamoDB scan. A single table.scan() call only
    returns up to ~1MB of results and silently stops there -- this keeps
    calling with ExclusiveStartKey until every page has been read."""
    items = []
    response = table.scan(**kwargs)
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"], **kwargs)
        items.extend(response.get("Items", []))
    return items