FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/       ./app/
COPY static/    ./static/
COPY features/  ./features/
COPY tests/     ./tests/

# Generate a sample log on first run if LOG_FILE doesn't exist/is empty
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV LOG_FILE=/logs/access.log \
    TAIL_LINES=1000000 \
    HEAVY_USAGE_IQR_MULTIPLIER=1.5 \
    HEAVY_USAGE_MIN_REQUESTS=10 \
    REFRESH_INTERVAL=2.0 \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/stats || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
