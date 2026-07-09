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

# clean_names with no backing field in this org — Salesforce rejects the
# ENTIRE query if the SELECT list references a field that doesn't exist
# (confirmed directly: a real query against this org 400'd until these
# were excluded), so these must never appear in a SELECT clause. Downstream
# code still gets these keys via parse_opportunity_record, just always None.
KNOWN_MISSING_FIELDS = {"account_segment", "discount_pct", "days_open", "current_stage_duration_days"}


def _queryable_fields() -> set[str]:
    return {v for k, v in FIELD_MAP.items() if k not in KNOWN_MISSING_FIELDS}


def _escape_soql_string(value: str) -> str:
    """Minimal SOQL string escaping — Salesforce's REST query endpoint takes
    a raw query string, not parameterized queries, so any interpolated
    value needs its quotes/backslashes escaped by hand."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_opportunities_by_owner_soql(owner_id: str) -> str:
    fields = ", ".join(sorted(_queryable_fields()))
    safe_owner_id = _escape_soql_string(owner_id)
    return f"SELECT {fields} FROM Opportunity WHERE {_OWNER_FIELD} = '{safe_owner_id}'"


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


def build_rep_name_by_owner_soql(owner_id: str) -> str:
    """
    Resolves Sales_Rep_Name__c for a given Salesforce Owner ID — used to
    join into Everstage (Everstage has no rep id, only rep name). LIMIT 1
    since we only need one representative value, not every opportunity.
    """
    name_field = FIELD_MAP["sales_rep_name"]
    safe_owner_id = _escape_soql_string(owner_id)
    return (
        f"SELECT {name_field} repName "
        f"FROM Opportunity "
        f"WHERE {_OWNER_FIELD} = '{safe_owner_id}' "
        f"LIMIT 1"
    )


def build_attainment_current_month_soql(owner_id: str) -> str:
    """
    Closed-won ARR for this owner, CloseDate in the current calendar month.

    NOTE: SOQL's SUM() only accepts a plain field reference — there is no
    SUM(CASE WHEN ...) construct in SOQL (unlike BigQuery/ANSI SQL), so the
    single conditional-aggregation query this replaces
    (_fetch_salesforce_attainment_sync) has to become two separate
    aggregate queries here, each filtered by a SOQL date literal
    (THIS_MONTH) instead of a CASE expression inside the SUM.
    """
    arr_field = FIELD_MAP["deal_value_arr"]
    close_date_field = FIELD_MAP["close_date_target"]
    won_field = FIELD_MAP["is_won"]
    safe_owner_id = _escape_soql_string(owner_id)
    return (
        f"SELECT SUM({arr_field}) closedWonArr "
        f"FROM Opportunity "
        f"WHERE {_OWNER_FIELD} = '{safe_owner_id}' "
        f"AND {won_field} = true "
        f"AND {close_date_field} = THIS_MONTH"
    )


def build_attainment_trailing_3_months_soql(owner_id: str) -> str:
    """
    Closed-won ARR for this owner, CloseDate within the trailing 3 calendar
    months INCLUDING the current month — matching the original BigQuery
    filter (`CloseDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3
    MONTH), MONTH)`, i.e. 3 months back through today).

    NOTE: SOQL's LAST_N_MONTHS:3 date literal starts at the beginning of
    the *previous* month and does NOT include the current month, so on its
    own it would under-count relative to the original logic. THIS_MONTH is
    OR'd in to restore that inclusive range. See
    build_attainment_current_month_soql for why this is a second, separate
    query rather than one conditional-aggregation query.
    """
    arr_field = FIELD_MAP["deal_value_arr"]
    close_date_field = FIELD_MAP["close_date_target"]
    won_field = FIELD_MAP["is_won"]
    safe_owner_id = _escape_soql_string(owner_id)
    return (
        f"SELECT SUM({arr_field}) closedWonArr "
        f"FROM Opportunity "
        f"WHERE {_OWNER_FIELD} = '{safe_owner_id}' "
        f"AND {won_field} = true "
        f"AND ({close_date_field} = LAST_N_MONTHS:3 OR {close_date_field} = THIS_MONTH)"
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
