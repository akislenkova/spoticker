FROM python:3.11-slim

WORKDIR /app

# Build context is plan/ (deploy with `railway up` from plan/), so the image
# contains exactly the checked-out code rather than a fresh clone of main.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
