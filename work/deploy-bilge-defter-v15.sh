#!/usr/bin/env bash
set -euo pipefail
base=/opt/bilge-defter-test
previous=/opt/bilge-defter-test/releases/20260920-195129
release=/opt/bilge-defter-test/releases/20260920-201121
stage=/tmp/bilge-defter-test-20260920-201121
backup_name=bilge-defter-test-rollback-20260920-201121
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test "$(readlink -f "$base/current")" = "$previous"
test "$(sha256sum "$previous/index.html" | cut -d' ' -f1)" = d44e909e73f50689fb791810b84a78a3e3707df1a1dfe90c9cf6901b7c99b6f3
test "$(docker inspect bilge-defter-test --format '{{.Image}}')" = "$image"
test "$(docker inspect bilge-defter-test --format '{{.State.Status}}')" = running
! docker container inspect "$backup_name" >/dev/null 2>&1
test ! -e "$release"
test "$(sha256sum "$stage/index.html" | cut -d' ' -f1)" = 9d59bcbde9f139ac05fdfd90f820aba7da7ec90a2d1d3f421c68f8bd098f6644
test "$(sha256sum "$stage/sw.js" | cut -d' ' -f1)" = bbb8a6769253f5020f835674c0b725ab9accbec8d8be17520aa888dfb9df4a36
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
docker ps --format '{{.Names}}|{{.ID}}|{{.Status}}' | sort
readlink -f "$base/current"

