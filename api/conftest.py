import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture(autouse=True)
def mock_vector_store_service():
    try:
        with patch("api.index.VectorStoreService") as mock:
            mock_instance = MagicMock()
            mock_instance.search.return_value = []
            mock.return_value = mock_instance
            yield mock
    except (ImportError, AttributeError):
        # If api.index is not loadable (e.g. during some test runs), skip this patch
        yield None
