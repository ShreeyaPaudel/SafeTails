"""Location generalisation is privacy-critical and deterministic - test it directly."""
from app.utils.geo import generalise_location, resolve_ward
from app.utils.kathmandu_areas import KATHMANDU_AREAS


def test_generalisation_snaps_nearby_points_together():
    # Two points ~30 m apart (well within a 100 m grid) should generalise to the same cell.
    a = generalise_location(27.7172, 85.3240, grid_meters=100)
    b = generalise_location(27.71745, 85.32425, grid_meters=100)
    assert a == b


def test_generalisation_is_idempotent():
    once = generalise_location(27.7172, 85.3240)
    twice = generalise_location(*once)
    assert once == twice


def test_generalisation_moves_point_at_most_grid_distance():
    lat, lng = 27.7172, 85.3240
    glat, glng = generalise_location(lat, lng, grid_meters=100)
    # roughly within one grid cell in degrees
    assert abs(glat - lat) < 0.001
    assert abs(glng - lng) < 0.001


def test_resolve_ward_falls_back_to_nearest_area_without_local_data(tmp_path, monkeypatch):
    """Without ward polygons the resolver must still name an area.

    Regression test: it previously returned None whenever the (never-created) ward GeoJSON was
    absent, so every report submitted through the app was stored with no area at all and could
    not be selected by the client's area filter.
    """
    import app.utils.geo as geo

    monkeypatch.setattr(geo, "BASE_DIR", tmp_path)
    geo._load_areas.cache_clear()
    geo._load_ward_polygons.cache_clear()
    assert resolve_ward(27.6470, 85.3030) == "Bhaisepati"
    assert resolve_ward(27.7154, 85.3110) == "Thamel"


def test_resolve_ward_is_stable_under_generalisation():
    """The stored (generalised) coordinate must resolve to the same area as the raw one, since
    the generalised value is what is persisted and later filtered on."""
    raw = (27.64712, 85.30288)
    assert resolve_ward(*raw) == resolve_ward(*generalise_location(*raw))


def test_resolve_ward_none_outside_served_region():
    """A point far outside the valley must not be snapped onto an unrelated neighbourhood."""
    assert resolve_ward(28.2096, 83.9856) is None      # Pokhara
    assert resolve_ward(51.5074, -0.1278) is None      # London


def test_resolve_ward_none_when_no_reference_data_at_all():
    assert resolve_ward(
        27.7172, 85.3240,
        geojson_path="data/does_not_exist.geojson",
        areas_path="data/does_not_exist.json",
    ) is None


def test_resolved_areas_are_all_selectable_in_the_client_filter():
    """Every name the backend can assign must exist in the canonical list the client offers,
    otherwise a report is stored under a name no filter can select."""
    canonical = {name for name, _lng, _lat in KATHMANDU_AREAS}
    for lat, lng in [(27.6470, 85.3030), (27.7154, 85.3110), (27.6780, 85.3490), (27.6727, 85.3250)]:
        assert resolve_ward(lat, lng) in canonical
