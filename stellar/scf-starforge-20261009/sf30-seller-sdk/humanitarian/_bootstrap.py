"""MIT. Locate the maintained Dataset workspace beside this product."""
from pathlib import Path
import sys

XML = Path(__file__).resolve().parents[1] / "xml"
if str(XML) not in sys.path:
    sys.path.insert(0, str(XML))
