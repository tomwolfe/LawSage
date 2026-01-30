import yaml
import os
from pathlib import Path
from typing import Any, Dict

def get_settings() -> Dict[str, Any]:
    """
    Reads config/settings.yaml from the project root.
    Returns a dictionary containing the configuration.
    """
    # Try to find the config file starting from the current directory up to the root
    # Usually we expect it to be in 'config/settings.yaml' relative to the root
    
    root_dir = Path(__file__).parent.parent
    config_path = root_dir / "config" / "settings.yaml"
    
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found at {config_path}")
    
    try:
        with open(config_path, "r") as f:
            settings = yaml.safe_load(f)
            
        if not settings or "model" not in settings or "id" not in settings["model"]:
            raise ValueError("Invalid configuration: 'model.id' is missing.")
            
        return settings
    except yaml.YAMLError as e:
        raise ValueError(f"Error parsing YAML configuration: {e}")
    except Exception as e:
        raise Exception(f"Unexpected error loading settings: {e}")
