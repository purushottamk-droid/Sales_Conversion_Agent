"""
salesforce_mcp_server/soql.py

SOQL query construction + response-record parsing for the two tools this
server exposes. FIELD_MAP is the single place mapping our clean field
names to real Salesforce API field names — verified against this org's
actual schema via verify_field_map.py. current_stage_duration_days has no
usable backing field in this org (the real Days-in-Stage-equivalent field
is 100% null), so it's mapped to Days_Since_Last_Activity__c as a proxy
instead — same underlying column as days_since_last_touch.

account_segment, discount_pct, and opportunity_previous_solution were
removed entirely (not just excluded from queries) — none of them drive
any reasoning step in account_analysis_agent's prompt, and their backing
fields are either nonexistent or 100% null, so they added cost with no
signal. days_open (Days_Open__c) was removed for the same reason — not
referenced in any reasoning step, and every sampled value is 0.0.

Relationship fields (e.g. "Account.Name") come back from Salesforce's
REST query API as NESTED objects, not flat dotted keys — parse_opportunity_record
below walks the dotted path to handle that.
"""

# clean_name -> Salesforce API field path (dotted for relationship traversal)
FIELD_MAP = {
    "opportunity_id":               "Opportunity_ID__c",               # NOT the Salesforce record Id — Gong's Gong_Calls_Data.OPPORTUNITY_ID joins on this external-ID custom field instead, confirmed against real data (Id 006fj00000HU2x4AAD has Opportunity_ID__c 006DMO000000000100200, which matches 5 real Gong call rows)
    "opportunity_name":              "Name",
    "account_id":                    "AccountId",
    "account_name":                  "Account.Name",
    "industry":                      "Account.Industry",
    "opportunity_type":              "Type",
    "current_stage":                 "StageName",
    "forecast_category":             "ForecastCategoryName",
    "deal_value_arr":                "ARR__c",                          # confirmed via null_check.py — Amount is 100% null in this org, ARR__c is 100% populated
    "created_date":                  "CreatedDate",
    "close_date_target":             "CloseDate",
    "current_stage_duration_days":   "Days_Since_Last_Activity__c",     # substitute — real Days_in_Stage-equivalent field is 100% null in this org, using Days Since Last Activity as the closest available proxy per user direction
    "days_since_last_touch":         "Days_Since_Last_Activity__c",     # confirmed
    "next_step":                     "NextStep",                      # flipped after data reupload — standard NextStep is now 100% populated, Next_Step__c is now 100% null (was the opposite before the reupload)
    "risks":                         "Risks__c",                       # confirmed
    "cbi_raw_text":                  "CBIs__c",                        # confirmed
    "opportunity_manager_notes":     "Manager_Notes__c",               # confirmed
    "sales_rep_name":                "Sales_Rep_Name__c",              # confirmed — Owner.Name and Sales_Rep_Name__c both 100% populated but disagree on every sampled record; Owner.Name is just the Salesforce login that owns the record (often a shared/admin account), Sales_Rep_Name__c is the actual rep this pipeline is about
    "contact_name":                  "Contact_Name__c",                # confirmed
    "contact_title":                 "Contact_Title__c",               # confirmed
    "is_won":                        "IsWon",
    "is_closed":                     "IsClosed",
    "owner_id":                      "OwnerId",                        # NOT usable for per-rep scoping — every Opportunity in this org shares one OwnerId (a shared/integration user). Kept here only so callers can recover a real, valid Salesforce User Id for Task-assignment purposes (see create_task) — Sales_Rep_Name__c has no corresponding Salesforce User record to assign Tasks to instead.
}

# Only needed for the WHERE clause itself, not part of the returned shape
_REP_NAME_FIELD = "Sales_Rep_Name__c"


def _queryable_fields() -> set[str]:
    return set(FIELD_MAP.values())


def _escape_soql_string(value: str) -> str:
    """Minimal SOQL string escaping — Salesforce's REST query endpoint takes
    a raw query string, not parameterized queries, so any interpolated
    value needs its quotes/backslashes escaped by hand."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_opportunities_by_rep_name_soql(rep_name: str) -> str:
    """
    Scoped by Sales_Rep_Name__c, not OwnerId — every Opportunity in this org
    shares one OwnerId (a shared/integration user), so OwnerId can't
    distinguish individual reps. Sales_Rep_Name__c is the only field that
    actually does.
    """
    fields = ", ".join(sorted(_queryable_fields()))
    safe_rep_name = _escape_soql_string(rep_name)
    return f"SELECT {fields} FROM Opportunity WHERE {_REP_NAME_FIELD} = '{safe_rep_name}'"


def build_opportunities_by_account_soql(account_id: str) -> str:
    """
    Every opportunity on this account, regardless of owner or open/closed
    status — used for expansion-whitespace detection (does a Migration/
    Upsell/Cross Sell opportunity exist anywhere for this account), which
    is a different question than "this rep's own open pipeline."
    """
    fields = ", ".join(sorted(_queryable_fields()))
    safe_account_id = _escape_soql_string(account_id)
    return f"SELECT {fields} FROM Opportunity WHERE AccountId = '{safe_account_id}'"


def build_stage_benchmark_soql() -> str:
    stage_field = FIELD_MAP["current_stage"]
    duration_field = FIELD_MAP["current_stage_duration_days"]
    won_field = FIELD_MAP["is_won"]
    return (
        f"SELECT {stage_field} stage, AVG({duration_field}) avgDays "
        f"FROM Opportunity "
        f"WHERE {won_field} = true AND {duration_field} != null "
        f"GROUP BY {stage_field}"
    )


def _extract(record: dict, field_path: str):
    """Walk a dotted relationship path (e.g. 'Account.Name') through the
    nested dicts Salesforce's REST API returns for related objects."""
    value = record
    for part in field_path.split("."):
        if value is None:
            return None
        value = value.get(part)
    return value


def parse_opportunity_record(record: dict) -> dict:
    """Map one raw Salesforce query record into our clean field names."""
    return {clean_name: _extract(record, api_field) for clean_name, api_field in FIELD_MAP.items()}
