#!/usr/bin/env python3
import os
import sys
import tempfile
import socket
import ipaddress
import hashlib
import errno
import unittest
from unittest.mock import MagicMock

class MockFinder:
    @classmethod
    def find_spec(cls, name, path=None, target=None):
        if any(name.startswith(pfx) for pfx in ["fastapi", "starlette", "uvicorn", "litellm"]):
            from importlib.machinery import ModuleSpec
            return ModuleSpec(name, cls)
        return None

    @classmethod
    def create_module(cls, spec):
        mod = MagicMock()
        mod.__name__ = spec.name
        mod.__path__ = []
        return mod

    @classmethod
    def exec_module(cls, module):
        pass

sys.meta_path.insert(0, MockFinder)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import yaml
except ImportError:
    class MiniYaml:
        @staticmethod
        def dump(data, f):
            import json
            f.write(json.dumps(data))
        @staticmethod
        def safe_load(f):
            import json
            return json.loads(f.read())
    yaml = MiniYaml()
    sys.modules["yaml"] = yaml

from entrypoint import (
    is_numeric_loopback_url,
    is_numeric_loopback_host,
    install_airgap_socket_guard,
    validate_and_parse_routing_graph,
    LOCAL_ALLOWED_PREFIXES
)

def run_tests():
    print("============================================================")
    print("     TetherIQ Air-Gapped Zero-Egress Python Security Suite   ")
    print("============================================================")

    passed = 0
    total = 0

    def check(condition, desc):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"  ✔ {desc}")
        else:
            print(f"  ✖ FAILED: {desc}")
            sys.exit(1)

    print("\n[Suite 1: Numeric Loopback URL Validation]")
    check(is_numeric_loopback_url("http://127.0.0.1:11434"), "Validates standard numeric IPv4 loopback (127.0.0.1)")
    check(is_numeric_loopback_url("http://127.0.0.1:1234/v1"), "Validates numeric IPv4 loopback with path")
    check(is_numeric_loopback_url("http://[::1]:11434"), "Validates standard numeric IPv6 loopback ([::1])")
    check(not is_numeric_loopback_url("http://localhost:11434"), "Strictly rejects localhost hostname (DNS rebinding prevention)")
    check(not is_numeric_loopback_url("http://user:pass@127.0.0.1:11434"), "Strictly rejects URLs with embedded credentials")
    check(not is_numeric_loopback_url("http://127.0.0.1:11434?query=1"), "Strictly rejects URLs with query parameters")
    check(not is_numeric_loopback_url("https://127.0.0.1:11434"), "Rejects HTTPS schemes for local unencrypted loopback")
    check(not is_numeric_loopback_url("http://192.168.1.50:11434"), "Strictly rejects private LAN non-loopback IPs")
    check(not is_numeric_loopback_url("http://api.anthropic.com"), "Strictly rejects public cloud hostnames")

    print("\n[Suite 2: Process-Wide Socket Connection Guard]")
    install_airgap_socket_guard()

    # 1. Test connect() to public IP
    test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    socket_blocked = False
    try:
        test_sock.connect(("8.8.8.8", 53))
    except PermissionError:
        socket_blocked = True
    except Exception:
        pass
    finally:
        test_sock.close()
    check(socket_blocked, "Process-wide socket guard aborts socket.connect to public IP (8.8.8.8)")

    # 2. Test connect_ex() returns errno.EPERM without blocking
    test_sock_ex = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    res_ex = test_sock_ex.connect_ex(("8.8.8.8", 53))
    test_sock_ex.close()
    check(res_ex == errno.EPERM, "Process-wide connect_ex returns errno.EPERM on non-loopback destination")

    # 3. Test connect() to external hostname
    test_sock_host = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    host_blocked = False
    try:
        test_sock_host.connect(("api.openai.com", 443))
    except PermissionError:
        host_blocked = True
    except Exception:
        pass
    finally:
        test_sock_host.close()
    check(host_blocked, "Process-wide socket guard aborts socket.connect to external hostname (api.openai.com)")

    # 4. Prove the guard decision against a reachable controlled listener. The
    # hostname attempt must be denied before the OS connects, while the same
    # listener remains reachable through its numeric loopback address.
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.settimeout(2)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    listener_port = listener.getsockname()[1]

    hostname_client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    hostname_listener_blocked = False
    try:
        hostname_client.connect(("localhost", listener_port))
    except PermissionError:
        hostname_listener_blocked = True
    finally:
        hostname_client.close()
    check(
        hostname_listener_blocked,
        "Guard blocks a hostname connection even when a controlled listener is reachable",
    )

    loopback_client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    accepted = None
    try:
        loopback_client.connect(("127.0.0.1", listener_port))
        accepted, _ = listener.accept()
        check(
            loopback_client.getpeername()[1] == listener_port,
            "Guard permits the same controlled listener through numeric loopback",
        )
    finally:
        if accepted is not None:
            accepted.close()
        loopback_client.close()
        listener.close()

    print("\n[Suite 3: Transitive Routing Graph & Multi-Node Cycle Validation]")

    # Case A: Valid 100% local air-gapped configuration with LM Studio and Ollama
    valid_cfg = {
        "general_settings": {
            "disable_admin_ui": True
        },
        "model_list": [
            {"model_name": "local-llama", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
            {"model_name": "local-qwen", "litellm_params": {"model": "openai/qwen-2.5", "api_base": "http://127.0.0.1:1234/v1"}},
        ],
        "router_settings": {
            "fallbacks": [
                {"local-llama": ["local-qwen"]}
            ]
        }
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(valid_cfg, f)
        valid_path = f.name

    is_valid, err, deps, fbs = validate_and_parse_routing_graph(valid_path)
    check(is_valid and len(deps) == 2, "Validates local model list (Ollama + local OpenAI/LM Studio) and valid fallback chain")
    os.remove(valid_path)

    # Case B: Multi-node cycle (A -> B -> A)
    multi_cycle_cfg = {
        "model_list": [
            {"model_name": "model-a", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
            {"model_name": "model-b", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
        ],
        "router_settings": {
            "fallbacks": [
                {"model-a": ["model-b"]},
                {"model-b": ["model-a"]},
            ]
        }
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(multi_cycle_cfg, f)
        multi_cycle_path = f.name

    is_valid_mc, err_mc, _, _ = validate_and_parse_routing_graph(multi_cycle_path)
    check(not is_valid_mc and "cycle" in err_mc.lower(), "Detects and rejects multi-node cycle (A -> B -> A)")
    os.remove(multi_cycle_path)

    # Case C: Remote database_url in general_settings
    remote_db_cfg = {
        "general_settings": {
            "database_url": "postgresql://user:pass@db.cloud.internal:5432/spend_db"
        },
        "model_list": [
            {"model_name": "local-llama", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
        ]
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(remote_db_cfg, f)
        remote_db_path = f.name

    is_valid_db, err_db, _, _ = validate_and_parse_routing_graph(remote_db_path)
    check(not is_valid_db and "database_url" in err_db, "Strictly rejects remote database_url in general_settings")
    os.remove(remote_db_path)

    # Case C2: Mapped network drive SQLite database_url in general_settings
    mapped_db_cfg = {
        "general_settings": {
            "database_url": "sqlite:///Z:/share/spend.db"
        },
        "model_list": [
            {"model_name": "local-llama", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
        ]
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(mapped_db_cfg, f)
        mapped_db_path = f.name

    is_valid_mapped, err_mapped, _, _ = validate_and_parse_routing_graph(mapped_db_path)
    check(not is_valid_mapped and "database_url" in err_mapped, "Strictly rejects mapped network drive SQLite database_url")
    os.remove(mapped_db_path)

    # Case C3: UNC network share database_url in general_settings
    unc_db_cfg = {
        "general_settings": {
            "database_url": "sqlite:////server/share/spend.db"
        },
        "model_list": [
            {"model_name": "local-llama", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
        ]
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(unc_db_cfg, f)
        unc_db_path = f.name

    is_valid_unc, err_unc, _, _ = validate_and_parse_routing_graph(unc_db_path)
    check(not is_valid_unc and "database_url" in err_unc, "Strictly rejects UNC network share SQLite database_url")
    os.remove(unc_db_path)

    # Case D: Remote redis_host in router_settings
    remote_redis_cfg = {
        "router_settings": {
            "redis_host": "redis.production.cloud"
        },
        "model_list": [
            {"model_name": "local-llama", "litellm_params": {"model": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}},
        ]
    }
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        yaml.dump(remote_redis_cfg, f)
        remote_redis_path = f.name

    is_valid_rd, err_rd, _, _ = validate_and_parse_routing_graph(remote_redis_path)
    check(not is_valid_rd and "redis_host" in err_rd, "Strictly rejects remote redis_host in router_settings")
    os.remove(remote_redis_path)

    print("\n------------------------------------------------------------")
    print(f"Results: {passed} Passed | 0 Failed | Total: {total}")
    print("------------------------------------------------------------")
    print("✔ ALL PYTHON AIR-GAPPED SECURITY TESTS PASSED SUCCESSFULLY.\n")

if __name__ == "__main__":
    run_tests()
