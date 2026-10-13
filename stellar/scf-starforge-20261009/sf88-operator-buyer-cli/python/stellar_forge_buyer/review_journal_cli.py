"""Customer commands for the original complete-journal return contract."""
from __future__ import annotations

from .review_location import remember_receipt
from .review_serve import browser_arguments, serve_foreground


def add_journal_commands(commands, *, page_arguments, download_arguments):
    journal = commands.add_parser("review-returns",
        help="Receive, reconcile and export complete reviewer journals").add_subparsers(
            dest="subcommand", required=True)
    for command in ("stage", "receive"):
        parser = journal.add_parser(command)
        parser.add_argument("--input", required=True)
        parser.add_argument("--sha256")
        parser.add_argument("--operation-id", required=True)
        if command == "stage":
            parser.add_argument("--label")
        parser.add_argument("--serve", action="store_true")
        browser_arguments(parser, selection=False)
    listing = journal.add_parser("list")
    listing.add_argument("--comparison-id")
    listing.add_argument("--all", action="store_true")
    page_arguments(listing)
    for command in ("show", "targets"):
        parser = journal.add_parser(command)
        parser.add_argument("id", help="Original full-journal plan ID")
        parser.add_argument("--classification", default="",
            choices=["", "CONFLICT", "RETURNED_AHEAD", "LOCAL_AHEAD", "IDENTICAL"])
        page_arguments(parser)
        if command == "targets":
            parser.add_argument("--all", action="store_true")
    history = journal.add_parser("history")
    history.add_argument("id", help="Original source-journal ID")
    history.add_argument("--target")
    history.add_argument("--all", action="store_true")
    page_arguments(history)
    restage = journal.add_parser("restage")
    restage.add_argument("id", help="Original saved plan ID")
    restage.add_argument("--operation-id", required=True)
    restage.add_argument("--label")
    restage.add_argument("--serve", action="store_true")
    browser_arguments(restage, selection=False)
    apply = journal.add_parser("apply")
    apply.add_argument("id", help="Original full-journal plan ID")
    apply.add_argument("--input", required=True,
        help="Original operationId, expectedBaseId, actor and resolutions JSON")
    export = journal.add_parser("export")
    export.add_argument("id", help="Original comparison ID, including every journal and receipt")
    download_arguments(export, formats=True)
    verify = journal.add_parser("verify")
    verify.add_argument("--input", required=True)
    verify.add_argument("--sha256")


def execute_journal(library, args, *, json_file, all_items):
    command = args.subcommand
    if command in ("receive", "stage"):
        options = dict(operation_id=args.operation_id, expected_sha256=args.sha256)
        if command == "stage":
            received = library.stage_journal(args.input, label=args.label, **options).observed
        else:
            received = library.receive_journal(args.input, **options).observed
        remember_receipt(library, received, return_format="returned")
        return serve_foreground(library, args, received=received, return_format="returned") if args.serve else received
    if command == "verify":
        return library.verify_journal(args.input, expected_sha256=args.sha256)
    if command == "list":
        return (all_items(library.iter_journal_returns(comparison_id=args.comparison_id, page_size=args.limit))
            if args.all else library.journal_returns(comparison_id=args.comparison_id,
                offset=args.offset, limit=args.limit))
    if command == "history":
        return (all_items(library.iter_journal_history(args.id, target=args.target, page_size=args.limit))
            if args.all else library.journal_history(args.id, target=args.target,
                offset=args.offset, limit=args.limit))
    if command == "export":
        return library.export_journal(args.id, args.out, format=args.format,
            transfer_directory=args.transfer_directory, chunk_bytes=args.chunk_bytes)
    if command == "apply":
        # Forward the saved request unchanged: the original engine reconciles its
        # receipt before consulting a plan that may have advanced since dispatch.
        result = library.invoke("reviewReturns.apply", {"id": args.id, "input": json_file(args.input)})
        remember_receipt(library, result, return_format="returned")
        return result
    if command == "restage":
        request = {"operationId": args.operation_id}
        if args.label is not None:
            request["label"] = args.label
        received = library.invoke("reviewReturns.restage", {"id": args.id, "input": request})
        remember_receipt(library, received, return_format="returned")
        return serve_foreground(library, args, received=received, return_format="returned") if args.serve else received
    plan = library.journal_return(args.id, offset=args.offset, limit=args.limit,
                                  classification=args.classification)
    if command == "show":
        return plan.observed
    if args.all:
        return all_items(plan.iter_targets(classification=args.classification, page_size=args.limit))
    return plan.observed["targets"]
