FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

ENV PORT=5000
ENV SECRET_KEY=it_vault_super_secret_key_2026

CMD ["gunicorn", "app:app", "--timeout", "600", "--workers", "2", "--bind", "0.0.0.0:5000"]
