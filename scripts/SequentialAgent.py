"""
scripts/pipeline.py — Root SequentialAgent wiring all 4 agents together.
"""

from google.adk.agents import SequentialAgent

from scripts.data_collection_custom_agent.agent import DataCollectionAgent
from scripts.account_analysis_agent import account_analysis_agent
#from scripts.rep_quota_analysis_agent import rep_quota_analysis_agent
from scripts.rep_assessment_agent import rep_assessment_agent
from scripts.decision_action_agent import decision_action_agent

root_agent = SequentialAgent(
    name="sales_rep_pipeline",
    sub_agents=[
        DataCollectionAgent(name="DataCollectionAgent"),  # Agent 1
        account_analysis_agent,                            # Agent 2
        #rep_quota_analysis_agent,                           # Agent 3a
        rep_assessment_agent,                               # Agent 3b
        decision_action_agent,                              # Agent 4
    ]
)