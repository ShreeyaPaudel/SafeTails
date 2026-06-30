"""Spatial decision-support maths - thesis-critical, tested as pure functions (no DB)."""
import numpy as np

from app.services.spatial import dbscan_clusters, getis_ord_hotspots, ward_anomalies


def test_getis_ord_flags_a_dense_cluster_as_significant_hotspot():
    # 40 points packed in a tiny area + a few scattered elsewhere -> the dense area is a hotspot.
    rng = np.random.default_rng(42)
    dense_lat = 27.700 + rng.normal(0, 0.0008, 40)
    dense_lng = 85.300 + rng.normal(0, 0.0008, 40)
    sparse_lat = 27.700 + rng.uniform(0.02, 0.06, 8)
    sparse_lng = 85.300 + rng.uniform(0.02, 0.06, 8)
    lats = np.concatenate([dense_lat, sparse_lat])
    lngs = np.concatenate([dense_lng, sparse_lng])
    cells = getis_ord_hotspots(lats, lngs)
    assert cells, "expected at least one scored cell"
    top = cells[0]
    assert top.kind == "hotspot"
    assert top.gi_z > 1.65
    assert top.significance in ("p<0.05", "p<0.01")


def test_getis_ord_returns_empty_for_too_few_points():
    assert getis_ord_hotspots(np.array([27.7, 27.71]), np.array([85.3, 85.31])) == []


def test_dbscan_finds_two_clusters_and_rejects_noise():
    a_lat = [27.700, 27.7005, 27.7002, 27.7008]
    a_lng = [85.300, 85.3005, 85.3002, 85.3008]
    b_lat = [27.740, 27.7405, 27.7402]
    b_lng = [85.340, 85.3405, 85.3402]
    noise_lat = [27.900]
    noise_lng = [85.500]
    lats = np.array(a_lat + b_lat + noise_lat)
    lngs = np.array(a_lng + b_lng + noise_lng)
    clusters = dbscan_clusters(lats, lngs, min_samples=3)
    assert len(clusters) == 2
    assert clusters[0].size >= clusters[1].size
    # the far-away noise point is not in any cluster
    assert sum(c.size for c in clusters) == 7


def test_ward_anomaly_detects_a_surge():
    # A ward flat at ~1/day for 18 days then spiking to 8/day for 3 days is a surge.
    baseline = [1, 0, 1, 2, 1, 1, 0, 1, 2, 1, 1, 0, 1, 1, 2, 1, 0, 1]
    surge = [8, 9, 7]
    out = ward_anomalies({"Thamel": baseline + surge, "Quiet": baseline + [1, 0, 1]})
    wards = {a.ward: a for a in out}
    assert "Thamel" in wards and wards["Thamel"].direction == "surge"
    assert wards["Thamel"].z >= 1.5
    assert "Quiet" not in wards  # no anomaly for the flat ward
