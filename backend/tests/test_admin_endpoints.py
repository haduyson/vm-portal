import pytest
from httpx import AsyncClient
from app.models.user_model import User


@pytest.mark.asyncio
async def test_create_user(client: AsyncClient, test_admin: User):
    """Test creating a new user as admin."""
    # Login as admin
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "AdminPass123"},
    )
    token = login_response.json()["access_token"]

    # Create user
    response = await client.post(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "newuser",
            "password": "NewPass123",
            "is_admin": False,
            "max_vms": 5,
            "max_disk_gb": 100,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert data["is_admin"] is False
    assert data["max_vms"] == 5
    assert data["max_disk_gb"] == 100


@pytest.mark.asyncio
async def test_create_user_non_admin(client: AsyncClient, test_user: User):
    """Test creating user as non-admin fails."""
    # Login as regular user
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPass123"},
    )
    token = login_response.json()["access_token"]

    # Try to create user
    response = await client.post(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "newuser",
            "password": "NewPass123",
            "is_admin": False,
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_users(client: AsyncClient, test_admin: User):
    """Test listing all users as admin."""
    # Login as admin
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "AdminPass123"},
    )
    token = login_response.json()["access_token"]

    # List users
    response = await client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_update_user(client: AsyncClient, test_admin: User, test_user: User):
    """Test updating user as admin."""
    # Login as admin
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "AdminPass123"},
    )
    token = login_response.json()["access_token"]

    # Update user
    response = await client.patch(
        f"/api/admin/users/{test_user.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "is_admin": True,
            "max_vms": 10,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_admin"] is True
    assert data["max_vms"] == 10


@pytest.mark.asyncio
async def test_delete_user(client: AsyncClient, test_admin: User, test_user: User):
    """Test deleting user as admin."""
    # Login as admin
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "AdminPass123"},
    )
    token = login_response.json()["access_token"]

    # Delete user
    response = await client.delete(
        f"/api/admin/users/{test_user.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_get_stats(client: AsyncClient, test_admin: User):
    """Test getting system stats as admin."""
    # Login as admin
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "AdminPass123"},
    )
    token = login_response.json()["access_token"]

    # Get stats
    response = await client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "total_vms" in data
    assert "running_vms" in data
    assert data["total_users"] >= 1
