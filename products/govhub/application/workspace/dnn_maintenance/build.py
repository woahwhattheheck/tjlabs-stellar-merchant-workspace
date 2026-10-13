#!/usr/bin/env python3
"""Build the complete DNN operator from the declared existing source installation."""
import argparse
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from dnn_maintenance.delivery import build_source
def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-source", type=Path, default=ROOT.parent)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    result = build_source(args.engine_source, args.out)
    print(json.dumps({k: v for k, v in result.items() if k != "manifest"}))
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
