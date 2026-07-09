"""
salesforce_mcp_server/soql.py

SOQL query construction + response-record parsing for the two tools this
server exposes. FIELD_MAP is the single place mapping our clean field
names to real Salesforce API field names — verified against this org's
actual schema via verify_field_map.py. Four fields have no backing field
anywhere in this org (see the module-level note below FIELD_MAP) and two
have a second plausible candidate field — both flagged inline.

Relationship fields (e.g. "Account.Name") come back from Salesforce's
REST query API as NESTED objects, not flat dotted keys — parse_opportunity_record
below walks the dotted path to handle that.
"""

# clean_name -> Salesforce API field path (dotted for relationship traversal)
#
# NOTE — 4 fields below don't exist anywhere in this org's schema (checked
# both standard and custom fields on Opportunity/Account via describe):
# account_segment, discount_pct, days_open, current_stage_duration_days.
# Kept mapped to a (nonexistent) field name as a placeholder — the SOQL
# built from these will error until this is resolved. Options: drop them
# from the output entirely, or confirm the data lives somewhere else.
FIELD_MAP = {
    "opportunity_id":               "Id",
    "opportunity_name":              "Name",
    "account_id":                    "AccountId",
    "account_name":                  "Account.Name",
    "industry":                      "Account.Industry",
    "account_segment":               "Account.Segment__c",              # NOT FOUND — no such field in this org
    "opportunity_type":              "Type",
    "current_stage":                 "StageName",
    "forecast_category":             "ForecastCategoryName",
    "deal_value_arr":                "ARR__c",                          # confirmed via null_check.py — Amount is 100% null in this org, ARR__c is 100% populated
    "discount_pct":                  "Discount__c",                     # NOT FOUND — no such field in this org
    "created_date":                  "CreatedDate",
    "close_date_target":             "CloseDate",
    "days_open":                     "Days_in_Pipeline__c",             # NOT FOUND — no such field in this org
    "current_stage_duration_days":   "Days_in_Stage__c",                # NOT FOUND — no such field in this org
    "days_since_last_touch":         "Days_Since_Last_Activity__c",     # confirmed
    "next_step":                     "Next_Step__c",                   # confirmed via null_check.py — NextStep is 100% null in this org, Next_Step__c is 100% populated
    "risks":                         "Risks__c",                       # confirmed
    "cbi_raw_text":                  "CBIs__c",                        # confirmed
    "opportunity_manager_notes":     "Manager_Notes__c",               # confirmed
    "sales_rep_name":                "Sales_Rep_Name__c",              # confirmed — Owner.Name and Sales_Rep_Name__c both 100% populated but disagree on every sampled record; Owner.Name is just the Salesforce login that owns the record (often a shared/admin account), Sales_Rep_Name__c is the actual rep this pipeline is about
    "opportunity_previous_solution": "Previous_Solution__c",           # confirmed
    "contact_name":                  "Contact_Name__c",                # confirmed
    "contact_title":                 "Contact_Title__c",               # confirmed
    "is_won":                        "IsWon",
    "is_closed":                     "IsClosed",
}

# Only needed for the WHERE clause itself, not part of the returned shape
_OWNER_FIELD = "OwnerId"


def _escape_soql_string(value: str) -> str:
    """Minimal SOQL string escaping — Salesforce's REST query endpoint takes
    a raw query string, not parameterized queries, so any interpolated
    value needs its quotes/backslashes escaped by hand."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_opportunities_by_owner_soql(owner_id: str) -> str:
    fields = ", ".join(sorted(set(FIELD_MAP.values())))
    safe_owner_id = _escape_soql_string(owner_id)
    return f"SELECT {fields} FROM Opportunity WHERE {_OWNER_FIELD} = '{safe_owner_id}'"


def build_opportunities_by_account_soql(account_id: str) -> str:
    """
    Every opportunity on this account, regardless of owner or open/closed
    status — used for expansion-whitespace detection (does a Migration/
    Upsell/Cross Sell opportunity exist anywhere for this account), which
    is a different question than "this rep's own open pipeline."
    """
    fields = ", ".join(sorted(set(FIELD_MAP.values())))
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
