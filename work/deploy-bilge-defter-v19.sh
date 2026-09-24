#!/usr/bin/env bash
set -euo pipefail
base=/opt/bilge-defter-test
previous=/opt/bilge-defter-test/releases/20260920-205953
release=/opt/bilge-defter-test/releases/20260920-211257
stage=/tmp/bilge-defter-test-20260920-211257
backup_name=bilge-defter-test-rollback-20260920-211257
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test "$(readlink -f "$base/current")" = "$previous"
test "$(sha256sum "$previous/index.html" | cut -d' ' -f1)" = 36fed8e0c9a245d72ca4cf346d720f545acb8c8d88807ddf2e0542221db73738
test "$(docker inspect bilge-defter-test --format '{{.Image}}')" = "$image"
test "$(docker inspect bilge-defter-test --format '{{.State.Status}}')" = running
! docker container inspect "$backup_name" >/dev/null 2>&1
test ! -e "$release"
test "$(sha256sum "$stage/index.html" | cut -d' ' -f1)" = 8e88d070256ce419c6d6688172d66a1f2b5d6b3aab8374be411aaf27dc9fb4af
test "$(sha256sum "$stage/sw.js" | cut -d' ' -f1)" = 8e95248d4ec571d36ac5faf6cd1db20bfba1486a264a8a371d4f05ab260a4e1b
test "$(sha256sum "$stage/SHA256SUMS" | cut -d' ' -f1)" = b04658bbdb14a7100ec02c9452edd8f7dc5f4443f83f1babfedc5e049beea1c3
(cd "$stage" && sha256sum --check SHA256SUMS >/dev/null)
sudo -n install -d -m 0755 -o root -g root "$release"
sudo -n cp -a "$stage/." "$release/"
sudo -n chown -R root:root "$release"
docker ps --format '{{.Names}}|{{.ID}}|{{.Status}}' | sort
docker stop bilge-defter-test >/dev/null
docker rename bilge-defter-test "$backup_name"
restore() {
  status=$?
  if [ "$status" -ne 0 ]; then
    if docker container inspect bilge-defter-test >/dev/null 2>&1; then
      docker rm -f bilge-defter-test >/dev/null
    fi
    sudo -n ln -sfn "$previous" "$base/current"
    docker rename "$backup_name" bilge-defter-test
    docker start bilge-defter-test >/dev/null
  fi
  exit "$status"
}
trap restore EXIT
sudo -n ln -sfn "$release" "$base/current"
docker run -d --name bilge-defter-test --restart unless-stopped --read-only \
  --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m \
  --tmpfs /var/run:rw,noexec,nosuid,size=1m \
  --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID \
  -p 127.0.0.1:18787:80 -p 100.84.251.49:18788:80 \
  -v /opt/bilge-defter-test/current:/usr/share/nginx/html:ro "$image"
# Temporary output stays inside this task's staging directory.
curl --retry 5 --retry-all-errors --retry-delay 1 --connect-timeout 3 --max-time 5 --fail --silent --show-error \
  http://127.0.0.1:18787/ -o "$stage/served.html"
cmp "$stage/served.html" "$release/index.html"
curl --fail --silent --show-error http://127.0.0.1:18787/pdf-workspace.js -o "$stage/served-pdf.js"
cmp "$stage/served-pdf.js" "$release/pdf-workspace.js"
curl --fail --silent --show-error http://127.0.0.1:18787/vendor/pdfjs/pdf.min.js -o "$stage/served-engine.js"
cmp "$stage/served-engine.js" "$release/vendor/pdfjs/pdf.min.js"
docker ps --format '{{.Names}}|{{.ID}}|{{.Status}}' | sort
readlink -f "$base/current"
