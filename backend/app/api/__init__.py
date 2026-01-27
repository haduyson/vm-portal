from app.api.auth_endpoints import router as auth_router
from app.api.vm_endpoints import router as vm_router
from app.api.health_endpoints import router as health_router

__all__ = ["auth_router", "vm_router", "health_router"]
