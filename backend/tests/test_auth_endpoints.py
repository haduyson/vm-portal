import pytest
from httpx import AsyncClient
from app.models.user_model import User


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user: User):
    """Test successful login."""
    response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["username"] == "testuser"
    assert data["is_admin"] is False


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, test_user: User):
    """Test login with invalid credentials."""
    response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "WrongPassword"},
    )
    assert response.status_code == 401
    assert "không đúng" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, test_user: User):
    """Test getting current user info."""
    # Login first
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    token = login_response.json()["access_token"]

    # Get user info
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["is_admin"] is False


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient):
    """Test getting user info without auth."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, test_user: User):
    """Test updating user profile."""
    # Login first
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    token = login_response.json()["access_token"]

    # Update telegram_chat_id
    response = await client.patch(
        "/api/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"telegram_chat_id": "123456789"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["telegram_chat_id"] == "123456789"


@pytest.mark.asyncio
async def test_update_password(client: AsyncClient, test_user: User):
    """Test updating password."""
    # Login first
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    token = login_response.json()["access_token"]

    # Update password
    response = await client.patch(
        "/api/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "TestPass123",
            "new_password": "NewPass123",
        },
    )
    assert response.status_code == 200

    # Try logging in with new password
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "NewPass123"},
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_get_quota(client: AsyncClient, test_user: User):
    """Test getting user quota."""
    # Login first
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    token = login_response.json()["access_token"]

    # Get quota
    response = await client.get(
        "/api/auth/quota",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "max_vms" in data
    assert "used_vms" in data
    assert "max_disk_gb" in data
    assert "used_disk_gb" in data
    assert data["used_vms"] == 0
