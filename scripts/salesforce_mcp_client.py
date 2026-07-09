"""
scripts/salesforce_mcp_client.py

Shared MCP client for our own GCP-hosted Salesforce server
(salesforce_mcp_server/ — see that package's docs and the plan doc "Build
a Custom Salesforce MCP Server on GCP" for why it exists instead of using
Salesforce's own hosted MCP server).

Used by both DataCollectionAgent (Agent 1, reads) and decision_action_agent
(Agent 3, writes) — extracted here rather than duplicated, since both now
need to call this same server.

Access to our own server is gated by Cloud Run IAM, not Salesforce OAuth —
Salesforce auth (JWT Bearer) happens server-side, inside
salesforce_mcp_server. Callers here just need a GCP identity token.
"""

import asyncio
import json
import os

from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token
from mcp import ClientSession
from mcp.client.sse import sse_client


async def _get_gcp_identity_token(audience: str) -> str:
    """
    Fetch a GCP identity token scoped to our own Cloud Run service's URL,
    using this pipeline's Application Default Credentials.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, id_token.fetch_id_token, google_auth_requests.Request(), audience
    )


async def call_salesforce_mcp_tool(tool_name: str, arguments: dict):
    """
    Open an MCP client session over SSE against our own salesforce_mcp_server
    Cloud Run service, call one tool, and return its parsed result.

    Env var: SALESFORCE_MCP_SERVER_URL — our own Cloud Run service URL.
    """
    server_url = os.environ["SALESFORCE_MCP_SERVER_URL"]
    identity_token = await _get_gcp_identity_token(server_url)

    async with sse_client(server_url, headers={"Authorization": f"Bearer {identity_token}"}) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)

    if result.isError:
        raise RuntimeError(f"MCP tool {tool_name!r} returned an error: {result.content}")

    # FastMCP populates structuredContent for tools with a typed return
    # (list[dict]/dict, as our tools have) — fall back to parsing the text
    # content block as JSON if a server ever only returns that.
    if result.structuredContent is not None:
        return result.structuredContent
    return json.loads(result.content[0].text)
