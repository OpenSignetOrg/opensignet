"""Paid-model-free tests of official CrewAI tools against the real Node MCP server and SDK."""

from contextlib import contextmanager, ExitStack, redirect_stdout
import asyncio
import importlib.abc
import importlib.metadata
import json
from io import StringIO
import os
from pathlib import Path
import sys
import sysconfig
import tomllib
import unittest
from unittest.mock import patch

PACKAGE = Path(__file__).resolve().parents[1]
VERSION = tomllib.loads(
    (PACKAGE.parent / "crewai-plugin/pyproject.toml").read_text(encoding="utf-8")
)["project"]["version"]
sys.path.insert(0, str(PACKAGE / "examples" / "crewai"))

from crewai.tools import BaseTool  # noqa: E402
from crewai import Agent, Crew, Task  # noqa: E402
from crewai.llms.base_llm import BaseLLM  # noqa: E402
from crewai.mcp import MCPClient  # noqa: E402
from crewai.tools.mcp_native_tool import MCPNativeTool  # noqa: E402
from crewai.tools.tool_failure import ToolFailure  # noqa: E402
from pydantic import ValidationError  # noqa: E402
import opensignet_crewai  # noqa: E402
import opensignet_crewai.connector as connector  # noqa: E402
from readonly_flow import (  # noqa: E402
    AgentArguments,
    AvailabilityArguments,
    READ_ONLY_TOOLS,
    WorkflowError,
    child_environment,
    constrain_tools,
    domain_availability,
    main,
    native_tools,
    readonly_tools,
    renewal_report,
    server_parameters,
)


@contextmanager
def chroma_tripwires():
    import chromadb
    from chromadb.api.client import Client
    from chromadb.api.async_client import AsyncClient
    from chromadb.api.models.Collection import Collection
    from chromadb.api.models.CollectionCommon import CollectionCommon
    from chromadb.api import collection_configuration
    from chromadb.config import System

    hits = []
    watched = []

    def trap(name):
        def reject(*_args, **_kwargs):
            hits.append(name)
            raise AssertionError(f"Recipe accessed forbidden Chroma operation: {name}")

        return reject

    class NoChromaServer(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname == "chromadb.server" or fullname.startswith("chromadb.server."):
                trap(fullname)()
            return None

    with ExitStack() as stack:
        targets = [
            (
                chromadb,
                [
                    "Client",
                    "PersistentClient",
                    "EphemeralClient",
                    "HttpClient",
                    "AsyncHttpClient",
                    "CloudClient",
                    "AdminClient",
                ],
            ),
            (
                Client,
                [
                    "__init__",
                    "create_collection",
                    "get_collection",
                    "get_or_create_collection",
                    "delete_collection",
                    "list_collections",
                ],
            ),
            (
                AsyncClient,
                [
                    "__init__",
                    "create_collection",
                    "get_collection",
                    "get_or_create_collection",
                    "delete_collection",
                    "list_collections",
                ],
            ),
            (CollectionCommon, ["__init__", "_embed", "_embed_record_set"]),
            (Collection, ["add", "get", "query", "upsert", "update", "delete"]),
            (
                collection_configuration,
                [
                    "load_create_collection_configuration_from_json",
                    "load_update_collection_configuration_from_json",
                    "load_collection_configuration_from_json",
                ],
            ),
            (System, ["start"]),
        ]
        for target, names in targets:
            for name in names:
                assert hasattr(target, name), f"Chroma tripwire target drifted: {name}"
                label = f"{target.__name__}.{name}"
                watched.append(label)
                stack.enter_context(patch.object(target, name, side_effect=trap(label)))
        finder = NoChromaServer()
        sys.meta_path.insert(0, finder)
        stack.callback(sys.meta_path.remove, finder)
        yield hits, watched


AGENT = "11111111-1111-4111-8111-111111111111"
KEY = "osk_" + "fixture".ljust(43, "0")
NODE = os.environ["CREWAI_TEST_NODE"]
# The real built server, with the API stand-in preloaded in front of it.
ENTRY = PACKAGE / "dist" / "index.js"
PRELOAD = (PACKAGE / "test" / "crewai-fixture.ts").as_uri()
REAL_SERVER_PARAMETERS = server_parameters
POISON = {
    "AGENT_PRIVATE_KEY": "synthetic-do-not-inherit",
    "OPENSIGNET_API_KEY": "synthetic-do-not-inherit",
    "OPENSIGNET_API_URL": "https://never-contact.example.invalid",
    "OPENSIGNET_ENABLE_WRITE_TOOLS": "true",
    "ALLOW_WRITES": "true",
    "NODE_OPTIONS": "--require=does-not-exist",
    "OPENAI_API_KEY": "synthetic-do-not-inherit",
    "ANTHROPIC_API_KEY": "synthetic-do-not-inherit",
    "GOOGLE_API_KEY": "synthetic-do-not-inherit",
}


class NoModelCalls(BaseLLM):
    def call(
        self,
        messages,
        tools=None,
        callbacks=None,
        available_functions=None,
        from_task=None,
        from_agent=None,
        response_model=None,
    ):
        raise AssertionError("Constructing the example Crew must not call a paid model")


def with_preload(params):
    params.args[0:0] = ["--import", PRELOAD]
    return params


@contextmanager
def preloaded():
    """Routes the connector's own server_parameters through the API stand-in."""
    with patch.object(
        connector,
        "server_parameters",
        lambda *args, **kwargs: with_preload(REAL_SERVER_PARAMETERS(*args, **kwargs)),
    ):
        yield


@contextmanager
def fixture(mode: str = "ready", api_key: str | None = KEY):
    with patch.dict(os.environ, POISON):
        params = with_preload(server_parameters(ENTRY, NODE, api_key))
        params.args.append(mode)
        with native_tools(params) as tools:
            yield tools


class ArgumentsTests(unittest.TestCase):
    def test_connector_is_installed_wheel_and_example_is_only_a_bridge(self):
        self.assertEqual(importlib.metadata.version("opensignet-crewai"), VERSION)
        self.assertEqual(opensignet_crewai.__version__, VERSION)
        assert opensignet_crewai.__file__ is not None
        installed_path = Path(opensignet_crewai.__file__).resolve()
        self.assertTrue(
            installed_path.is_relative_to(Path(sysconfig.get_path("purelib")).resolve())
        )
        self.assertIs(readonly_tools, opensignet_crewai.readonly_tools)
        self.assertIs(renewal_report, opensignet_crewai.renewal_report)

    def test_chroma_tripwires_really_reject_client_and_embedding_access(self):
        import chromadb
        from chromadb.api.models.CollectionCommon import CollectionCommon

        with chroma_tripwires() as (hits, watched):
            with self.assertRaises(AssertionError):
                chromadb.Client()
            with self.assertRaises(AssertionError):
                getattr(CollectionCommon, "_embed")(None, [])
            self.assertEqual(len(hits), 2)
            self.assertGreaterEqual(len(watched), 30)

    def test_fresh_environment_has_no_removed_adapter_or_pdf_dependencies(self):
        for name in (
            "crewai-tools",
            "mcpadapt",
            "pymupdf",
            "python-docx",
            "lxml",
            "pytube",
            "youtube-transcript-api",
            "beautifulsoup4",
            "soupsieve",
            "defusedxml",
            "tiktoken",
        ):
            with (
                self.subTest(name=name),
                self.assertRaises(importlib.metadata.PackageNotFoundError),
            ):
                importlib.metadata.version(name)
        self.assertEqual(importlib.metadata.version("crewai"), "1.15.21")
        self.assertEqual(importlib.metadata.version("mcp"), "1.28.1")

    def test_minimal_environment_never_inherits_keys_or_flags(self):
        result = child_environment({**POISON, "PATH": "bin", "SystemRoot": "windows"})
        self.assertEqual(
            result,
            {
                "PATH": "bin",
                "SystemRoot": "windows",
                "OPENSIGNET_ENABLE_WRITE_TOOLS": "false",
            },
        )

    def test_only_a_host_passed_identity_key_reaches_the_child(self):
        result = child_environment({"PATH": "bin"}, KEY)
        self.assertEqual(result["OPENSIGNET_API_KEY"], KEY)
        for value in ("synthetic-do-not-inherit", "osk_short", KEY + "x", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                child_environment({"PATH": "bin"}, value)

    def test_arguments_are_strict(self):
        self.assertEqual(AgentArguments(agentId=AGENT).model_dump(), {"agentId": AGENT})
        for value in (
            {},
            {"agentId": "../../keys"},
            {"agentId": AGENT, "apiKey": KEY},
            {"agentId": AGENT, "apiUrl": "https://untrusted.example.invalid"},
        ):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AgentArguments.model_validate(value)
        for value in (
            {"name": "reader"},
            {"name": "Reader", "tld": "xyz"},
            {"name": "reader.xyz", "tld": "xyz"},
            {"name": "reader", "tld": "xyz", "registerEns": True},
        ):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AvailabilityArguments.model_validate(value)

    def test_missing_duplicate_or_unexpected_tool_fails_closed(self):
        with self.assertRaises(WorkflowError):
            constrain_tools([])


class NativeConnectorTests(unittest.TestCase):
    def setUp(self):
        context = chroma_tripwires()
        hits, watched = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

        def verify():
            self.assertEqual(hits, [], "The qualified recipe must never access Chroma")
            print(
                "CREWAI_CHROMA "
                + json.dumps(
                    {"test": self.id(), "watched": len(watched), "hits": len(hits)}
                ),
                flush=True,
            )

        self.addCleanup(verify)

    def test_real_official_connector_and_sdk_reads(self):
        with (
            patch.dict(os.environ, POISON),
            preloaded(),
            readonly_tools(ENTRY, NODE, KEY) as tools,
        ):
            self.assertEqual(set(tools), set(READ_ONLY_TOOLS))
            self.assertTrue(all(isinstance(tool, BaseTool) for tool in tools.values()))
            self.assertTrue(all(type(tool) is MCPNativeTool for tool in tools.values()))
            ordered = list(tools.values())
            for invalid in (ordered[:1], ordered + [ordered[0]], [ordered[0]] * 2):
                with self.assertRaises(WorkflowError):
                    constrain_tools(invalid)
            reviewer = Agent(
                role="Renewal reviewer",
                goal="Check a domain keeps renewing",
                backstory="Read-only integration fixture",
                tools=ordered,
                llm=NoModelCalls(model="fixture-no-model"),
                allow_delegation=False,
                cache=False,
                verbose=False,
            )
            crew = Crew(
                agents=[reviewer],
                tasks=[
                    Task(
                        description="Check an identity's renewal",
                        expected_output="Renewal status",
                        agent=reviewer,
                    )
                ],
                cache=False,
                memory=False,
                verbose=False,
            )
            agent_tools = crew.agents[0].tools
            self.assertIs(crew.memory, False)
            self.assertIsNone(crew._memory)
            self.assertFalse(crew.knowledge_sources)
            self.assertFalse(reviewer.knowledge_sources)
            self.assertIs(crew.cache, False)
            assert agent_tools is not None
            self.assertEqual([tool.name for tool in agent_tools], list(READ_ONLY_TOOLS))

            report = renewal_report(tools, AGENT)
            self.assertTrue(report["ready"])
            self.assertIsNone(report["nextStep"])
            self.assertEqual(report["renewal"]["domain"], "reader.xyz")
            self.assertEqual(report["renewal"]["price"], "10440000")
            print("CREWAI_RENEWAL " + json.dumps(report), flush=True)

            available = domain_availability(tools, "reader", "xyz")
            self.assertTrue(available["available"])
            self.assertFalse(domain_availability(tools, "taken", "xyz")["available"])
            for args in ({"agentId": AGENT, "apiKey": KEY}, {"agentId": "not-a-uuid"}):
                with self.assertRaises(ValueError):
                    tools["get_renewal_status"].run(**args)

    def test_a_renewal_in_trouble_says_what_to_do(self):
        with fixture("not-ready") as tools:
            report = renewal_report(tools, AGENT)
            self.assertFalse(report["ready"])
            self.assertEqual(report["renewal"]["issue"]["code"], "wallet_balance_low")
            self.assertTrue(
                report["nextStep"].startswith("The OpenSignet wallet holds less")
            )

    def test_an_answer_for_another_identity_is_refused(self):
        with fixture("other-agent") as tools, self.assertRaises(WorkflowError):
            renewal_report(tools, AGENT)

    def test_without_the_identity_key_nothing_is_confirmed(self):
        with fixture(api_key=None) as tools:
            self.assertIsInstance(
                tools["get_renewal_status"].run(agentId=AGENT), ToolFailure
            )
            with self.assertRaises(WorkflowError):
                renewal_report(tools, AGENT)
            # The public read still works without any credential.
            self.assertTrue(domain_availability(tools, "reader", "xyz")["available"])

    def test_api_unavailable_is_not_readiness_and_is_not_retried(self):
        with fixture("api-error") as tools:
            self.assertIsInstance(
                tools["get_renewal_status"].run(agentId=AGENT), ToolFailure
            )
            with self.assertRaises(WorkflowError):
                renewal_report(tools, AGENT)

    def test_tools_cannot_be_called_after_context_close(self):
        with fixture() as tools:
            tool = tools["get_renewal_status"]
        with self.assertRaisesRegex(RuntimeError, "context is closed"):
            tool.run(agentId=AGENT)

    def test_cli_is_json_only(self):
        output = StringIO()
        argv = [
            "readonly_flow.py",
            "--server",
            str(ENTRY),
            "--node",
            NODE,
            "--agent-id",
            AGENT,
            "--api-key-env",
            "FIXTURE_IDENTITY_KEY",
        ]
        with (
            preloaded(),
            patch.object(sys, "argv", argv),
            redirect_stdout(output),
            patch.dict(os.environ, {**POISON, "FIXTURE_IDENTITY_KEY": KEY}),
        ):
            self.assertEqual(main(), 0)
        self.assertTrue(json.loads(output.getvalue())["ready"])

        output = StringIO()
        argv = [
            "readonly_flow.py",
            "--server",
            str(ENTRY),
            "--node",
            NODE,
            "--domain",
            "reader.xyz",
        ]
        with (
            preloaded(),
            patch.object(sys, "argv", argv),
            redirect_stdout(output),
            patch.dict(os.environ, POISON),
        ):
            self.assertEqual(main(), 0)
        self.assertTrue(json.loads(output.getvalue())["available"])

    def test_cli_refuses_a_renewal_read_without_the_key(self):
        argv = [
            "readonly_flow.py",
            "--server",
            str(ENTRY),
            "--node",
            NODE,
            "--agent-id",
            AGENT,
        ]
        environment = {
            key: value for key, value in POISON.items() if key != "OPENSIGNET_API_KEY"
        }
        with (
            preloaded(),
            patch.object(sys, "argv", argv),
            patch.dict(os.environ, environment),
            patch.dict(os.environ, {"OPENSIGNET_API_KEY": ""}),
        ):
            self.assertEqual(main(), 1)

    def test_discovery_missing_duplicate_and_schema_drift_fail_closed(self):
        for mode in ("missing-tool", "duplicate-tool", "invalid-schema"):
            with self.subTest(mode=mode), self.assertRaises(WorkflowError):
                with fixture(mode):
                    self.fail("Unqualified tool discovery was accepted")

    def test_official_retry_counter_is_one_attempt_not_one_retry(self):
        params = with_preload(server_parameters(ENTRY, NODE))
        from crewai.mcp.transports.stdio import StdioTransport

        client = MCPClient(
            StdioTransport(command=params.command, args=params.args), max_retries=1
        )
        attempts = 0

        async def fail():
            nonlocal attempts
            attempts += 1
            raise OSError("synthetic transport failure")

        with self.assertRaises(ConnectionError):
            asyncio.run(client._retry_operation(fail))
        self.assertEqual(attempts, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
