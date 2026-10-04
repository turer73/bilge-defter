# Pin the already inspected LibreOffice dependency layer. No Java/UNO service.
FROM bilge-defter-pdf-v53:pdf-worker
COPY pptx_worker.py /srv/pptx_worker.py
USER 1000:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/bin/python3", "/srv/pptx_worker.py"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD /usr/bin/python3 /srv/pptx_worker.py health
