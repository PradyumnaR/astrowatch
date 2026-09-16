"""
Shared DeepEval judge model.

Wraps deepeval's built-in AnthropicModel (deepeval.models.AnthropicModel),
which reads ANTHROPIC_API_KEY the same way every other Claude client in
this repo does — so the eval suite needs no second provider key, unlike
DeepEval's OpenAI-model default. Every LLM-judged metric across eval/
should pass model=get_judge_model() explicitly, since DeepEval's metric
constructors build a model client eagerly (even ones that only invoke it
conditionally, e.g. ToolCorrectnessMetric without available_tools) and
otherwise fall back to requiring OPENAI_API_KEY.
"""

import os

from deepeval.models import AnthropicModel

# Matches report_writer_node's own model (agents/graph/report_writer_node.py)
# — the judge should be at least as capable as the system it's grading.
DEFAULT_JUDGE_MODEL = "claude-sonnet-4-6"


def get_judge_model() -> AnthropicModel:
    return AnthropicModel(model=os.getenv("DEEPEVAL_JUDGE_MODEL", DEFAULT_JUDGE_MODEL))
