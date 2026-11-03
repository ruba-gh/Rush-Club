FROM python:3.12-slim
WORKDIR /app
COPY server.py .
COPY public ./public
RUN useradd -m rush && mkdir /app/data && chown rush:rush /app/data
USER rush
ENV PORT=8000 RUSH_ENV=production
EXPOSE 8000
CMD ["python", "server.py"]
