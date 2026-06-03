FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# RAILWAY_GIT_COMMIT_SHA is injected by Railway on every deploy;
# placing it here busts the cache so new commits always re-clone.
ARG RAILWAY_GIT_COMMIT_SHA=main
RUN git clone --depth 1 https://github.com/akislenkova/spoticker.git /tmp/repo \
    && pip install --no-cache-dir -r /tmp/repo/plan/requirements.txt \
    && cp -r /tmp/repo/plan/app ./app \
    && rm -rf /tmp/repo

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
