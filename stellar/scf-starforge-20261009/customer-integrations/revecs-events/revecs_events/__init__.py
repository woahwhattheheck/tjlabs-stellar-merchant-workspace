"""Complete customer event receiving for Biotech Catalyst Sentinel."""
from .workspace import Workspace
from .model import WorkspaceError

__version__ = "1.0.0"
__all__ = ["Workspace", "WorkspaceError"]
