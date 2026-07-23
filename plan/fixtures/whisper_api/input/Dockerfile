FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
    openai-whisper==20231117 \
    fastapi==0.110.0 \
    uvicorn[standard]==0.29.0 \
    python-multipart==0.0.9 \
    torch==2.2.0+cu121 \
    torchaudio==2.2.0+cu121 \
    --extra-index-url https://download.pytorch.org/whl/cu121

COPY . .

ENV WHISPER_MODEL=large-v3
ENV DEVICE=cuda
ENV COMPUTE_TYPE=float16
ENV MAX_CONCURRENT_REQUESTS=4

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
