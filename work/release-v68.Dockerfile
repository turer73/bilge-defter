# Local immutable deployed dependency layers; no OS/dependency changes.
FROM bilge-defter-accounts:v57-production AS production
COPY app /srv/app
FROM bilge-defter-accounts:v57-verify AS verify
COPY app /srv/app
COPY tests /srv/tests
USER 10001:10001
ENV PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
CMD ["python", "-m", "pytest", "-q", "/srv/tests", "-p", "no:cacheprovider"]
