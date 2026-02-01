import pytest
import os
import yaml
from api.config_loader import get_settings

def test_get_settings_success():
    """Verify that get_settings() returns the correct model ID from settings.yaml."""
    settings = get_settings()
    assert "model" in settings
    assert "id" in settings["model"]
    # Based on config/settings.yaml content seen earlier
    assert settings["model"]["id"] == "gemini-2.5-flash"

def test_get_settings_structure():
    """Verify the structure of the returned settings dictionary."""
    settings = get_settings()
    assert isinstance(settings, dict)
    assert isinstance(settings["model"], dict)
    assert isinstance(settings["model"]["id"], str)
