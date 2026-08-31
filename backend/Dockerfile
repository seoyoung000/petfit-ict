FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# TF GPU 경고 로그 억제 (CPU-only 운영)
ENV TF_CPP_MIN_LOG_LEVEL=2

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
