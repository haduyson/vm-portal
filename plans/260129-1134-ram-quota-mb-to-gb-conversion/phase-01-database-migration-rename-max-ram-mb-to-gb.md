# Phase 01: Database Migration - Rename max_ram_mb to max_ram_gb

## Context
Create Alembic migration to rename `users.max_ram_mb` to `users.max_ram_gb` and convert existing values from MB to GB.

## Priority
**HIGH** - This is the foundation for all other changes.

## Current Status
⏳ Pending

## Related Files
- `backend/app/models/user_model.py`
- `backend/alembic/versions/5bc36223ae32_add_user_quota_fields.py` (reference)

## File Ownership
- `backend/app/models/user_model.py`
- `backend/alembic/versions/[new_migration].py` (create new)

## Implementation Steps

### 1. Update User Model
**File:** `backend/app/models/user_model.py`

Change line 16:
```python
# FROM:
max_ram_mb = Column(Integer, nullable=True)  # null = unlimited

# TO:
max_ram_gb = Column(Integer, nullable=True)  # null = unlimited
```

### 2. Generate Alembic Migration
**Command:**
```bash
cd /home/vpscloud/backend
alembic revision -m "rename_max_ram_mb_to_max_ram_gb"
```

### 3. Edit Migration File
**File:** `backend/alembic/versions/[generated_revision]_rename_max_ram_mb_to_max_ram_gb.py`

**Upgrade function:**
```python
def upgrade() -> None:
    # Add new column max_ram_gb
    op.add_column('users', sa.Column('max_ram_gb', sa.Integer(), nullable=True))

    # Convert existing data: GB = MB / 1024 (integer division)
    # Use raw SQL to update values
    op.execute("""
        UPDATE users
        SET max_ram_gb = FLOOR(max_ram_mb / 1024.0)
        WHERE max_ram_mb IS NOT NULL
    """)

    # Drop old column
    op.drop_column('users', 'max_ram_mb')
```

**Downgrade function:**
```python
def downgrade() -> None:
    # Add back old column
    op.add_column('users', sa.Column('max_ram_mb', sa.Integer(), nullable=True))

    # Convert back: MB = GB * 1024
    op.execute("""
        UPDATE users
        SET max_ram_mb = max_ram_gb * 1024
        WHERE max_ram_gb IS NOT NULL
    """)

    # Drop new column
    op.drop_column('users', 'max_ram_gb')
```

### 4. Run Migration
**Commands:**
```bash
cd /home/vpscloud/backend
alembic upgrade head
```

### 5. Verify Migration
**Command:**
```bash
psql $DATABASE_URL -c "SELECT id, username, max_ram_gb FROM users LIMIT 5;"
```

Expected: Should show `max_ram_gb` column with converted values.

## Success Criteria
- [x] User model updated to use `max_ram_gb`
- [x] Migration file created and runs without errors
- [x] Existing data converted correctly (MB → GB)
- [x] Migration is reversible (downgrade works)
- [x] Database schema reflects changes

## Risk Assessment
**Medium Risk:**
- Data loss if migration fails mid-conversion
- Need to test migration on development database first
- Ensure backup before running on production

**Mitigation:**
- Test migration locally first
- Keep downgrade function working
- Backup database before migration

## Security Considerations
- No new security concerns
- Standard column rename operation
- Data integrity maintained through conversion logic

## Next Steps
After completion, proceed to Phase 02: Backend Schema Updates
