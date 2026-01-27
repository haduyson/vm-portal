# Code Standards - VM Portal

## General
- YAGNI, KISS, DRY principles
- Max 200 lines per file
- Descriptive kebab-case file names (frontend), snake_case (Python modules)

## Backend (Python)
- Python 3.12+, type hints required
- Async/await for all I/O operations
- Pydantic for validation, BaseSettings for config
- SQLAlchemy async ORM, no raw SQL in endpoints
- Try/except with meaningful error messages (Vietnamese)
- Proxmoxer calls wrapped in `asyncio.to_thread()`

## Frontend (TypeScript)
- React functional components only
- MUI v5 for all UI components
- Axios interceptors for auth
- All user-facing strings in Vietnamese
- Interface types for API responses

## API Conventions
- RESTful endpoints under /api/ prefix
- JWT Bearer token authentication
- HTTP status codes: 201 (created), 401 (unauthorized), 403 (forbidden), 404 (not found)
- Error responses: `{"detail": "Vietnamese error message"}`

## Security
- No hardcoded secrets, all in .env
- Bcrypt for passwords, JWT HS256 for tokens
- Input validation via Pydantic schemas
- SQL injection prevention via SQLAlchemy ORM
