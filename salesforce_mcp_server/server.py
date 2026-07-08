"""
salesforce_mcp_server/server.py

Custom, self-hosted MCP server exposing exactly the two purpose-built
Salesforce tools this pipeline needs — see the plan doc ("Build a Custom
Salesforce MCP Server on GCP") for why this exists instead of using
Salesforce's own hosted MCP server (Identity Passthrough auth model
doesn't fit an unattended, org-wide backend service).

Deployed as its own Cloud Run service, separate from the main ADK
pipeline. Cloud Run IAM (--no-allow-unauthenticated) gates access — only
callable by authenticated GCP identities, not the public internet.
"""

import os

import httpx
from mcp.server.fastmcp import FastMCP

from .salesforce_auth import get_salesforce_session
from .soql import (
    build_opportunities_by_owner_soql,
    build_stage_benchmark_soql,
    parse_opportunity_record,
)

SALESFORCE_API_VERSION = os.environ.get("SALESFORCE_API_VERSION", "v60.0")

mcp = FastMCP(
    "salesforce-data-server",
    host="0.0.0.0",
    port=int(os.environ.get("PORT", 8080)),
)


async def _run_soql(soql: str) -> list[dict]:
    access_token, instance_url = await get_salesforce_session()
    url = f"{instance_url}/services/data/{SALESFORCE_API_VERSION}/query"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            url,
            params={"q": soql},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        payload = response.json()

    records = list(payload.get("records", []))

    # TODO: Salesforce paginates query results past 2000 records via
    # nextRecordsUrl — neither tool below needs it yet for a single rep's
    # pipeline, but get_stage_duration_benchmark (org-wide) may eventually.
    if not payload.get("done", True):
        print("[salesforce_mcp_server] WARNING: query results are paginated "
              "and only the first page was fetched — nextRecordsUrl not followed yet.")

    return records


@mcp.tool()
async def get_opportunities_by_owner(owner_id: str) -> list[dict]:
    """Return every opportunity owned by this Salesforce user ID, in this
    pipeline's clean field-name shape (see soql.FIELD_MAP)."""
    records = await _run_soql(build_opportunities_by_owner_soql(owner_id))
    return [parse_opportunity_record(r) for r in records]


@mcp.tool()
async def get_stage_duration_benchmark() -> dict:
    """Org-wide average days-in-stage per stage, across all historically
    closed-won opportunities."""
    records = await _run_soql(build_stage_benchmark_soql())
    return {
        r["stage"]: round(r["avgDays"], 1)
        for r in records
        if r.get("stage") and r.get("avgDays") is not None
    }


if __name__ == "__main__":
    mcp.run(transport="sse")
