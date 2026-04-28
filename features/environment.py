"""
Behave environment — executed by Agent 3 (QA) to bootstrap test context.
Adds the project root to sys.path so step definitions can import app modules.
"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def before_all(context):
    context.project_root = PROJECT_ROOT


def before_scenario(context, scenario):
    context.result = None
    context.exception = None
