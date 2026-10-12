"""MIT. Original-source IATI results monitoring."""
from .workspace import IatiResults

def get_results(workspace):
    with workspace.mutex:
        value = getattr(workspace, "results", None)
        if value is None:
            value = IatiResults(workspace)
            workspace.results = value
        return value
