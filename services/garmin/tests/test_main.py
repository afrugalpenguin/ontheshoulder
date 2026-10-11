from main import library_version


def test_library_version_is_pinned_series():
    assert library_version().startswith("0.3.")
