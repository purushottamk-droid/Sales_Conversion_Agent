
from google.adk.agents import SequentialAgent


from scripts.data_collection_custom_agent.agent import DataCollectionAgent
from scripts.account_analysis_agent import account_analysis_agent
from scripts.account_analysis_agent.rep_id_fixup_agent import RepIdFixupAgent
from scripts.decision_action_agent import decision_action_agent

root_agent = SequentialAgent(
    name="sales_rep_pipeline",
    sub_agents=[
        DataCollectionAgent(name="DataCollectionAgent"),  # Agent 1
        account_analysis_agent,                            # Agent 2
        RepIdFixupAgent(name="RepIdFixupAgent"),            # deterministic rep_id/rep_name correction
        decision_action_agent,                             # Agent 3
    ]
)

