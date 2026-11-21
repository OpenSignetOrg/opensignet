"""Real AutoGen + real Node MCP/OpenSignet SDK; every API answer is synthetic."""
# The standalone test script must add its trusted example directory before imports.
# ruff: noqa: E402

from __future__ import annotations

import inspect
import json
import os
import sys
import tomllib
import unittest
from importlib.metadata import version
from pathlib import Path
from unittest.mock import patch

EXAMPLE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[5]
VERSION = tomllib.loads(
    (ROOT / "packages/autogen-plugin/pyproject.toml").read_text(encoding="utf-8")
)["project"]["version"]
sys.path.insert(0, str(EXAMPLE))

from opensignet_workbench import (
    SYSTEM_ENV_KEYS,
    TOOL_NAMES,
    AgentInput,
    AvailabilityInput,
    OpenSignetWorkbench,
    domain_availability,
    minimal_child_environment,
    renewal_report,
    result_json,
    server_parameters,
)
from assistant_example import create_assistant
from autogen_core import FunctionCall
from autogen_core.models import CreateResult, RequestUsage
from autogen_ext.models.replay import ReplayChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench

AGENT = "11111111-1111-4111-8111-111111111111"
KEY = "osk_" + "fixture".ljust(43, "0")
NODE = Path(os.environ["OPENSIGNET_AUTOGEN_NODE"]).resolve()
MCP_VERSION = json.loads((ROOT / "packages/mcp-server/package.json").read_text())[
    "version"
]
CHILD_KEYS = SYSTEM_ENV_KEYS | {"OPENSIGNET_ENABLE_WRITE_TOOLS", "OPENSIGNET_API_KEY"}


def workbench(mode: str = "ready", api_key: str | None = KEY) -> OpenSignetWorkbench:
    params = server_parameters(NODE, source_checkout=ROOT, api_key=api_key)
    params = params.model_copy(
        update={
            "args": [
                "--import",
                (ROOT / "packages/mcp-server/test/autogen-fixture.ts").as_uri(),
                *params.args,
            ],
            "env": {**params.env, "OPENSIGNET_FIXTURE_MODE": mode},
        }
    )
    return OpenSignetWorkbench(params)


class InputAndEnvironmentTests(unittest.TestCase):
    def test_connector_is_loaded_from_the_installed_distribution_not_checkout(self):
        self.assertEqual(version("opensignet-autogen"), VERSION)
        implementation = Path(inspect.getfile(OpenSignetWorkbench)).resolve()
        self.assertTrue(implementation.is_relative_to(Path(sys.prefix).resolve()))
        self.assertNotIn("packages/autogen-plugin/src", implementation.as_posix())
        self.assertEqual(OpenSignetWorkbench.__module__, "opensignet_autogen.workbench")

    def test_minimal_environment_is_allowlisted_not_a_copy_of_ambient_secrets(self):
        ambient = {
            key: "synthetic-do-not-forward"
            for key in (
                "AGENT_PRIVATE_KEY",
                "OPENSIGNET_API_KEY",
                "OPENSIGNET_ENABLE_WRITE_TOOLS",
                "OPENAI_API_KEY",
                "ANTHROPIC_API_KEY",
                "AUTOGEN_MODEL_CONFIG",
                "NODE_OPTIONS",
                "NPM_TOKEN",
                "AWS_SECRET_ACCESS_KEY",
                "GOOGLE_APPLICATION_CREDENTIALS",
                "HTTPS_PROXY",
            )
        }
        ambient.update(
            PATH="untrusted-search-path", SYSTEMROOT=os.environ.get("SYSTEMROOT", "")
        )
        env = minimal_child_environment(NODE, ambient)
        self.assertTrue(set(env).issubset(CHILD_KEYS))
        self.assertNotIn("OPENSIGNET_API_KEY", env)
        self.assertEqual(env["OPENSIGNET_ENABLE_WRITE_TOOLS"], "false")
        self.assertNotIn("untrusted-search-path", env["PATH"])

    def test_only_a_host_passed_identity_key_reaches_the_child(self):
        self.assertEqual(
            minimal_child_environment(NODE, {}, KEY)["OPENSIGNET_API_KEY"], KEY
        )
        for value in ("synthetic-do-not-forward", "osk_short", KEY + "x", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                minimal_child_environment(NODE, {}, value)

    def test_closed_inputs_reject_injected_config(self):
        self.assertEqual(AgentInput.model_validate({"agentId": AGENT}).agentId, AGENT)
        for value in (
            {},
            {"agentId": "../../keys"},
            {"agentId": AGENT, "apiUrl": "https://invalid.test"},
            {"agentId": AGENT, "apiKey": KEY},
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                AgentInput.model_validate(value)
        for value in (
            {"name": "reader"},
            {"name": "Reader", "tld": "xyz"},
            {"name": "reader.xyz", "tld": "xyz"},
            {"name": "reader", "tld": "xyz", "privateKey": "forbidden"},
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                AvailabilityInput.model_validate(value)

    def test_launcher_requires_trusted_built_package_and_no_model_command(self):
        params = server_parameters(NODE, source_checkout=ROOT)
        self.assertEqual(params.command, str(NODE))
        self.assertEqual(
            params.args, [str((ROOT / "packages/mcp-server/dist/index.js").resolve())]
        )
        self.assertNotIn("AGENT_PRIVATE_KEY", params.env)
        self.assertEqual(params.env["OPENSIGNET_ENABLE_WRITE_TOOLS"], "false")
        with self.assertRaises(ValueError):
            server_parameters(NODE)
        with self.assertRaises(ValueError):
            server_parameters(NODE, installed_package=ROOT, source_checkout=ROOT)

    def test_component_serialization_cannot_restore_an_unfiltered_base_workbench(self):
        tools = OpenSignetWorkbench(server_parameters(NODE, source_checkout=ROOT))
        with self.assertRaises(TypeError):
            tools.dump_component()


class RealWorkbenchTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_workbench_reads_renewal_with_only_the_passed_key(self):
        with patch.dict(
            os.environ,
            {
                "AGENT_PRIVATE_KEY": "not-a-real-key",
                "OPENSIGNET_API_KEY": "synthetic",
                "OPENSIGNET_ENABLE_WRITE_TOOLS": "true",
                "OPENAI_API_KEY": "synthetic",
            },
        ):
            async with workbench() as tools:
                self.assertIsInstance(tools, McpWorkbench)
                names = {tool["name"] for tool in await tools.list_tools()}
                self.assertEqual(
                    tools.initialize_result.serverInfo.name, "opensignet-mcp"
                )
                self.assertEqual(
                    tools.initialize_result.serverInfo.version, MCP_VERSION
                )
                self.assertEqual(names, set(TOOL_NAMES))
                report = await renewal_report(tools, AGENT)
                self.assertEqual(report["mode"], "read_only")
                self.assertTrue(report["ready"])
                self.assertIsNone(report["nextStep"])
                self.assertEqual(report["renewal"]["price"], "10440000")
                available = await domain_availability(tools, "reader", "xyz")
                self.assertTrue(available["available"])

    async def test_writes_and_configuration_are_denied_before_the_server(self):
        async with workbench() as tools:
            for name in (
                "set_auto_renew",
                "register_agent_identity",
                "send_agent_email",
                "run_shell",
            ):
                result = await tools.call_tool(
                    name, {"agentId": AGENT, "enabled": False}
                )
                self.assertTrue(result.is_error)
                self.assertIn("READ_ONLY_TOOL_DENIED", result.to_text())
            invalid = await tools.call_tool(
                "get_renewal_status",
                {"agentId": AGENT, "apiUrl": "https://foreign.invalid"},
            )
            self.assertTrue(invalid.is_error)
            self.assertIn("INVALID_INPUT", invalid.to_text())

    async def test_trouble_missing_keys_and_failures_are_not_fabricated_success(self):
        async with workbench("not-ready") as tools:
            report = await renewal_report(tools, AGENT)
            self.assertFalse(report["ready"])
            self.assertTrue(report["nextStep"].startswith("The OpenSignet wallet"))
        async with workbench("other-agent") as tools:
            with self.assertRaises(RuntimeError):
                await renewal_report(tools, AGENT)
        async with workbench(api_key=None) as tools:
            result = await tools.call_tool("get_renewal_status", {"agentId": AGENT})
            self.assertTrue(result.is_error)
            self.assertTrue(
                (await domain_availability(tools, "reader", "xyz"))["available"]
            )
        async with workbench("api-error") as tools:
            result = await tools.call_tool("get_renewal_status", {"agentId": AGENT})
            self.assertTrue(result.is_error)
            with self.assertRaises(RuntimeError):
                result_json(result)

    async def test_real_assistant_agent_replay_uses_real_mcp_tools_without_paid_llm(
        self,
    ):
        requests = [
            ("get_renewal_status", {"agentId": AGENT}),
            ("check_domain_availability", {"name": "reader", "tld": "xyz"}),
        ]
        model = ReplayChatCompletionClient(
            [
                CreateResult(
                    finish_reason="function_calls",
                    content=[
                        FunctionCall(
                            id=f"synthetic-call-{index}",
                            name=name,
                            arguments=json.dumps(arguments),
                        )
                    ],
                    usage=RequestUsage(prompt_tokens=0, completion_tokens=0),
                    cached=False,
                )
                for index, (name, arguments) in enumerate(requests)
            ]
            + [
                CreateResult(
                    finish_reason="stop",
                    content="reader.xyz renews automatically; nothing stands in the way.",
                    usage=RequestUsage(prompt_tokens=0, completion_tokens=0),
                    cached=False,
                )
            ]
        )
        try:
            async with workbench() as tools:
                agent = create_assistant(model, tools)
                result = await agent.run(
                    task="Check whether synthetic identity's domain keeps renewing."
                )
                executions = [
                    message
                    for message in result.messages
                    if message.type == "ToolCallExecutionEvent"
                ]
                self.assertEqual(len(executions), len(requests))
                self.assertEqual(
                    [event.content[0].name for event in executions],
                    [name for name, _ in requests],
                )
                self.assertTrue(
                    all(not event.content[0].is_error for event in executions)
                )
                answers = [json.loads(event.content[0].content) for event in executions]
                self.assertTrue(answers[0]["ready"])
                self.assertTrue(answers[1]["available"])
                self.assertIn("renews automatically", result.messages[-1].content)
        finally:
            await model.close()


if __name__ == "__main__":
    print(
        "AutoGen integration checks: SYNTHETIC API answers, "
        "no paid LLM or live account."
    )
    unittest.main(verbosity=2)
