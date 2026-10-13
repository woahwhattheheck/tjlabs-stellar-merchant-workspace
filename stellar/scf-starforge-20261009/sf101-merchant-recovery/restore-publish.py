#!/usr/bin/env python3
"""Publish one authenticated native restore tree with Linux no-replace rename."""
import ctypes
import errno
import json
import os
import signal
import stat
import sys

def need(ok, message):
    if not ok:
        raise RuntimeError(message)

def identity(value):
    return (str(value.st_dev), str(value.st_ino))

def directory(path, inherited, expected, private=False):
    need(os.path.realpath(path) == path, "Aliased publication directory")
    fd = os.dup(inherited)
    value = os.fstat(fd)
    named = os.lstat(path)
    need(identity(value) == expected and identity(value) == identity(named)
         and stat.S_ISDIR(named.st_mode) and stat.S_ISDIR(value.st_mode),
         "Publication directory identity changed")
    if private:
        need(value.st_uid == os.geteuid() and value.st_mode & 0o077 == 0,
             "Publication directory must be private and owned")
    return fd

def main():
    need(sys.platform.startswith("linux"), "Native restore publication requires Linux")
    (operation, destination, expected_dev, expected_ino,
     root_dev, root_ino, parent_dev, parent_ino) = sys.argv[1:]
    libc = ctypes.CDLL(None, use_errno=True)
    # No descendants are created. The inherited original flock survives Node death.
    parent = os.getppid()
    need(libc.prctl(1, signal.SIGTERM, 0, 0, 0) == 0, "Cannot retain parent lifetime")
    need(os.getppid() == parent and parent != 1, "Original restore owner exited")
    root = directory(operation, 4, (root_dev, root_ino), True)
    target_parent = directory(os.path.dirname(destination), 5, (parent_dev, parent_ino))
    try:
        held = os.fstat(3)
        lock = os.stat(".sf98-delivery.lock", dir_fd=root, follow_symlinks=False)
        need(stat.S_ISREG(held.st_mode) and held.st_nlink == 1
             and identity(held) == identity(lock), "Original restore lease differs")
        original = (expected_dev, expected_ino)
        stage = os.stat("tree", dir_fd=root, follow_symlinks=False)
        need(stat.S_ISDIR(stage.st_mode) and identity(stage) == original
             and stage.st_uid == os.geteuid() and stage.st_mode & 0o077 == 0,
             "Original staged tree differs")
        need(stage.st_dev == os.fstat(target_parent).st_dev,
             "Restore publication requires one filesystem")
        need(identity(os.lstat(operation)) == (root_dev, root_ino)
             and identity(os.lstat(os.path.dirname(destination))) == (parent_dev, parent_ino),
             "Original publication parent changed")
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                           ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(root, b"tree", target_parent,
                        os.fsencode(os.path.basename(destination)), 1)
        if result != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code))
        os.fsync(target_parent)
        os.fsync(root)
        final = os.stat(os.path.basename(destination), dir_fd=target_parent,
                        follow_symlinks=False)
        need(identity(final) == original and stat.S_ISDIR(final.st_mode),
             "Published restore tree differs")
        need(identity(os.lstat(operation)) == (root_dev, root_ino)
             and identity(os.lstat(os.path.dirname(destination))) == (parent_dev, parent_ino),
             "Original publication parent changed after rename")
        print(json.dumps({"status": "PUBLISHED", "dev": original[0], "ino": original[1]}))
    finally:
        os.close(target_parent)
        os.close(root)

if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
