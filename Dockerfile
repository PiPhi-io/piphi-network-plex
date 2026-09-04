FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY widgets ./widgets
ENV PIPHI_WIDGETS_PATH=/app/widgets
RUN pip install --no-cache-dir .
EXPOSE 8091
CMD ["uvicorn", "piphi_network_plex.main:app", "--host", "0.0.0.0", "--port", "8091"]
