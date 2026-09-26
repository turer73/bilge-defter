FROM sha256:9c7b3e941788b7068b48173a29687da41429b227fc5a0dddd4cd7be4106dbf93 AS production
# Reuse the deployed Python 3.12/dependencies. No dependency or OS upgrade.
COPY app /srv/app

FROM production AS verify
USER root
RUN pip install --no-cache-dir pytest==8.3.5
COPY tests /srv/tests
USER 10001:10001
ENV PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
CMD ["python", "-m", "pytest", "-q", "/srv/tests", "-p", "no:cacheprovider"]
