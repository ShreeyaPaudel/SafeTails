"""Auth flow tests: register, login, /me, and failure cases."""
from __future__ import annotations

REG = {
    "email": "shreeya@example.com",
    "username": "shreeya",
    "password": "supersecret1",
    "display_name": "Shreeya",
}


def test_register_returns_token_and_user(client):
    resp = client.post("/auth/register", json=REG)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["username"] == "shreeya"
    assert body["user"]["reputation"] == 50.0  # neutral start
    assert "hashed_password" not in body["user"]


def test_duplicate_registration_conflicts(client):
    client.post("/auth/register", json=REG)
    resp = client.post("/auth/register", json=REG)
    assert resp.status_code == 409


def test_login_and_me_roundtrip(client):
    client.post("/auth/register", json=REG)
    login = client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email" if "email" in me.json() else "username"]  # public schema
    assert me.json()["username"] == "shreeya"


def test_login_wrong_password_rejected(client):
    client.post("/auth/register", json=REG)
    resp = client.post("/auth/login", json={"email": REG["email"], "password": "wrong"})
    assert resp.status_code == 401


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401
