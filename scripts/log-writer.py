"""
@file log-writer.py
@description Emit dummy script logs into a local Supabase table.
@role CLI utility that simulates python script activity for the PoC.

@pseudocode
 1. Load Supabase connection settings from the environment.
 2. Create a Supabase client using the service role key.
 3. Generate synthetic log payloads with metadata.
 4. Insert log rows on a timed loop.
 5. Exit after the requested count or on interrupt.

@dependencies supabase-py
"""

from __future__ import annotations

import argparse
import os
import random
import time
import uuid
from typing import Any, Dict, Tuple

from supabase import Client, create_client

LOG_LEVELS = ["debug", "info", "warning", "error"]
LOG_MESSAGES = [
    "Starting scheduled task",
    "Loading configuration",
    "Fetching upstream payload",
    "Transforming dataset",
    "Completed batch successfully",
    "Retrying after transient failure",
    "Writing output artifacts",
    "Heartbeat check",
]


def load_config() -> Tuple[str, str]:
    """
    @function load_config
    @description Read Supabase connection settings from environment variables.
    @param {None} _ - No parameters.
    @returns {Tuple[str, str]} Supabase URL and service role key.
    @throws {RuntimeError} If required environment variables are missing.

    @behavior
     - Read SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
     - Validate both values are present.
     - Return the URL and key.

    @context
     Used by the log writer CLI before creating the client.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
        )

    return url, key


def build_log_payload(script_name: str, run_id: str, sequence: int) -> Dict[str, Any]:
    """
    @function build_log_payload
    @description Build a synthetic log payload for insertion.
    @param {str} script_name - Name of the script emitting the log.
    @param {str} run_id - Stable id for the current run.
    @param {int} sequence - Incrementing sequence number.
    @returns {Dict[str, Any]} Payload matching the script_logs schema.
    @throws {ValueError} If script_name is empty.

    @behavior
     - Validate script_name is non-empty.
     - Choose a random log level and message.
     - Construct metadata with run context.
     - Return a dict ready for Supabase insertion.

    @context
     Called for each log row inserted into Supabase.
    """
    if not script_name:
        raise ValueError("script_name is required")

    level = random.choice(LOG_LEVELS)
    message = random.choice(LOG_MESSAGES)
    metadata = {
        "run_id": run_id,
        "sequence": sequence,
        "execution_ms": random.randint(45, 1400),
    }

    return {
        "script_name": script_name,
        "level": level,
        "message": message,
        "metadata": metadata,
    }


def insert_log(client: Client, payload: Dict[str, Any]) -> None:
    """
    @function insert_log
    @description Insert a log payload into Supabase.
    @param {Client} client - Supabase client instance.
    @param {Dict[str, Any]} payload - Log payload to insert.
    @returns {None} No return value.
    @throws {RuntimeError} If Supabase returns an insert error.

    @behavior
     - Insert the payload into the script_logs table.
     - Raise if Supabase responds with an error.

    @context
     Used inside the log writer loop to persist each log entry.
    """
    try:
        client.table("script_logs").insert(payload).execute()
    except Exception as error:
        raise RuntimeError(f"Insert failed: {error}") from error


def run_writer(
    client: Client,
    script_name: str,
    count: int,
    interval: float,
    follow: bool,
) -> None:
    """
    @function run_writer
    @description Generate and insert logs on a timed loop.
    @param {Client} client - Supabase client instance.
    @param {str} script_name - Script name for the logs.
    @param {int} count - Number of logs to write.
    @param {float} interval - Seconds between log inserts.
    @param {bool} follow - Whether to run continuously.
    @returns {None} No return value.
    @throws {RuntimeError} If log insertion fails.

    @behavior
     - Initialize a run id.
     - Loop until count is reached or follow mode is interrupted.
     - Generate and insert payloads at the requested interval.

    @context
     Invoked by main after CLI parsing.
    """
    run_id = str(uuid.uuid4())
    sequence = 1

    while follow or sequence <= count:
        payload = build_log_payload(script_name, run_id, sequence)
        insert_log(client, payload)
        print(f"Inserted log {sequence} for {script_name}")
        sequence += 1
        time.sleep(interval)


def parse_args() -> argparse.Namespace:
    """
    @function parse_args
    @description Parse CLI arguments for the log writer.
    @param {None} _ - No parameters.
    @returns {argparse.Namespace} Parsed CLI options.
    @throws {SystemExit} If argparse validation fails.

    @behavior
     - Define CLI flags and defaults.
     - Parse arguments from sys.argv.
     - Return the parsed namespace.

    @context
     Used by main to configure the writer loop.
    """
    parser = argparse.ArgumentParser(description="Emit dummy script logs")
    parser.add_argument(
        "--script",
        default="demo-script",
        help="Script name to store with each log",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Number of logs to emit when not following",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Seconds between log entries",
    )
    parser.add_argument(
        "--follow",
        action="store_true",
        help="Keep writing logs until interrupted",
    )

    return parser.parse_args()


def main() -> None:
    """
    @function main
    @description CLI entrypoint for the log writer.
    @param {None} _ - No parameters.
    @returns {None} No return value.
    @throws {RuntimeError} If configuration or inserts fail.

    @behavior
     - Parse CLI options.
     - Load Supabase config.
     - Create the Supabase client.
     - Run the log writer loop.
     - Handle keyboard interrupts cleanly.

    @context
     Executed when the script runs as __main__.
    """
    args = parse_args()
    url, key = load_config()
    client = create_client(url, key)
    try:
        run_writer(client, args.script, args.count, args.interval, args.follow)
    except KeyboardInterrupt:
        print("Log writer stopped.")


if __name__ == "__main__":
    main()
