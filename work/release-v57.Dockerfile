FROM bilge-defter-accounts:v50 AS production
# deploy-v57.py verifies this local tag is exactly the deployed image ID.
# Reuse the deployed Python 3.12/dependencies. No dependency or OS upgrade.
COPY app /srv/app

FROM production AS verify
USER root
RUN pip install --no-cache-dir pytest==8.3.5
COPY tests /srv/tests
USER 10001:10001
ENV PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
CMD ["python", "-m", "pytest", "-q", "/srv/tests", "-p", "no:cacheprovider"]
