import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture(autouse=True)
def mock_vector_store_service():
    with patch("api.index.VectorStoreService") as mock:
        mock_instance = MagicMock()
        mock_instance.search.return_value = []
        mock.return_value = mock_instance
        yield mock
