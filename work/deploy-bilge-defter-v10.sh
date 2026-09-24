#!/usr/bin/env bash
set -euo pipefail
base=/opt/bilge-defter-test
previous=/opt/bilge-defter-test/releases/20260920-182009
release=/opt/bilge-defter-test/releases/20260920-183420
stage=/tmp/bilge-defter-test-20260920-183420
backup_name=bilge-defter-test-rollback-20260920-183420
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test "$(readlink -f "$base/current")" = "$previous"
test "$(sha256sum "$previous/index.html" | cut -d' ' -f1)" = a0a83eeca049ed79be255803868346f81b9c199cdeb92f2c42b89944bbfb67f7
test "$(docker inspect bilge-defter-test --format '{{.Image}}')" = "$image"
test "$(docker inspect bilge-defter-test --format '{{.State.Status}}')" = running
! docker container inspect "$backup_name" >/dev/null 2>&1
test ! -e "$release"
test "$(sha256sum "$stage/index.html" | cut -d' ' -f1)" = 8d467a257a12a2dfac6014103732e8b4e807f5ca22e852751ae090a5a4ab42ab
test "$(sha256sum "$stage/sw.js" | cut -d' ' -f1)" = fe22fdb2b8f8f2da7fd96e9d36d05b48dc9243ccca711091b6e05e3b90e35130
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
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent --show-error \
  http://127.0.0.1:18787/ -o "$stage/served.html"
cmp "$stage/served.html" "$release/index.html"
docker ps --format '{{.Names}}|{{.ID}}|{{.Status}}' | sort
readlink -f "$base/current"







