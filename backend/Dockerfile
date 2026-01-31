FROM python:3.12-slim

WORKDIR /app

# SEC-008: Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# SEC-008: Change ownership and switch to non-root user
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# SEC-013: Removed --reload for production, added workers
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
