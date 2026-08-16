import time

import boto3

from config import ATHENA_DATABASE, ATHENA_OUTPUT_LOCATION, AWS_REGION

_athena_client = boto3.client("athena", region_name=AWS_REGION)


def run_athena_query(query, max_wait_seconds=30):
    """
    Run a SQL query against the Glue-cataloged NOAA data via Athena and
    return the result rows as a list of dicts (column name -> value, all
    as strings -- Athena returns everything as VarCharValue regardless of
    the underlying column type).

    Athena queries are asynchronous: this starts the query, then polls
    get_query_execution until it succeeds, fails, or times out.
    """
    response = _athena_client.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": ATHENA_DATABASE},
        ResultConfiguration={"OutputLocation": ATHENA_OUTPUT_LOCATION},
    )
    query_execution_id = response["QueryExecutionId"]

    waited = 0
    while waited < max_wait_seconds:
        status = _athena_client.get_query_execution(QueryExecutionId=query_execution_id)
        state = status["QueryExecution"]["Status"]["State"]

        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            reason = status["QueryExecution"]["Status"].get(
                "StateChangeReason", "unknown reason"
            )
            raise RuntimeError(f"Athena query {state}: {reason}")

        time.sleep(1)
        waited += 1
    else:
        raise TimeoutError(f"Athena query did not finish within {max_wait_seconds}s")

    result = _athena_client.get_query_results(QueryExecutionId=query_execution_id)
    rows = result["ResultSet"]["Rows"]

    if not rows:
        return []

    headers = [col.get("VarCharValue") for col in rows[0]["Data"]]
    data_rows = []
    for row in rows[1:]:
        values = [col.get("VarCharValue") for col in row["Data"]]
        data_rows.append(dict(zip(headers, values)))

    return data_rows
