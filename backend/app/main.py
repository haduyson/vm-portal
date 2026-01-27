from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import create_tables
from app.api import auth_router, vm_router, health_router, admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup: Create database tables
    print("Creating database tables...")
    await create_tables()
    print("Database tables created successfully")

    yield

    # Shutdown: cleanup if needed
    print("Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title="VM Portal API",
    description="Internal Vietnamese VM Provisioning Portal",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for internal use
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for internal use
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with /api prefix
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(vm_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "VM Portal API",
        "version": "1.0.0",
        "docs": "/docs",
    }
