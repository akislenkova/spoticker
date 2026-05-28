FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN pip install vllm

COPY . .

ENV MODEL_ID=mistralai/Mistral-7B-Instruct-v0.2
ENV TENSOR_PARALLEL_SIZE=1
ENV MAX_MODEL_LEN=8192

EXPOSE 8000

CMD ["python3", "-m", "vllm.entrypoints.openai.api_server", \
     "--model", "${MODEL_ID}", \
     "--tensor-parallel-size", "${TENSOR_PARALLEL_SIZE}", \
     "--max-model-len", "${MAX_MODEL_LEN}"]
