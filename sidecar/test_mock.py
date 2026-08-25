import sys
import types
from unittest.mock import MagicMock
from importlib.machinery import ModuleSpec

class MockModuleFinder:
    def find_spec(self, fullname, path, target=None):
        if (fullname.startswith('litellm.integrations.focus') or 
            fullname.startswith('polars') or
            fullname.startswith('_polars')):
            return ModuleSpec(fullname, self)
        return None

    def create_module(self, spec):
        mod = types.ModuleType(spec.name)
        mod.__path__ = []
        return mod

    def exec_module(self, module):
        module.FocusLogger = MagicMock
        module.FocusTimeWindow = MagicMock
        module.MavvrikFocusLogger = MagicMock

sys.meta_path.insert(0, MockModuleFinder())

from litellm.litellm_core_utils import custom_logger_registry
print("CUSTOM LOGGER REGISTRY LOADED CLEANLY!")
