#!/usr/bin/env python3
"""Run the original receiving continuation under one Linux kernel lease."""
from __future__ import annotations
import argparse
import fcntl
import os
from pathlib import Path
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--python-sdk', type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = root / '.python-receiving.lock'
    flags = os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(lock_path, flags, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('The original Python receiving operation is already running.', file=sys.stderr)
            return 75
        command = ['node', str(Path(__file__).with_name('python-connected-operation.mjs')),
                   '--root', str(root)]
        if args.source:
            command.extend(['--source', str(args.source.resolve())])
        if args.python_sdk:
            command.extend(['--python-sdk', str(args.python_sdk.resolve())])
        env = dict(os.environ, OPENLINEAGE_RECEIVING_LOCK_ROOT=str(root),
                   OPENLINEAGE_RECEIVING_LOCK_FD=str(fd))
        # The supervisor retains the lease while its selected original Node programme runs.
        child = subprocess.Popen(command, env=env, pass_fds=(fd,))
        try:
            return child.wait()
        except KeyboardInterrupt:
            # Ctrl+C is delivered to the same foreground group. Let the original close/save finish.
            return child.wait()
    finally:
        os.close(fd)


if __name__ == '__main__':
    raise SystemExit(main())
