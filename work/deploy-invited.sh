#!/usr/bin/env bash
set -euo pipefail
base=/opt/bilge-defter-invited
stage=/tmp/bilge-defter-invited-20260920
archive=/tmp/bilge-defter-invited-20260920.tar.gz
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test ! -e "$base"
test ! -e "$stage"
test -z "$(ss -ltnH sport = :18790)"
! docker container inspect bilge-defter-invited-web >/dev/null 2>&1
test "$(readlink -f /opt/bilge-defter-test/current)" = /opt/bilge-defter-test/releases/20260920-215523
test "$(docker inspect bilge-defter-test --format '{{.Id}}')" = f5a638cdb85d5e4ea31d4ab882c94a7dcf6adaf36c8f3655ce13a5597ef23b12
test "$(sha256sum /opt/bilge-defter-test/current/index.html | cut -d' ' -f1)" = c5893910044eef9e8c3a733446e521ae06a3d65a5549825a55b51e9875e3f4f8
mkdir -m 0700 "$stage"
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/SHA256SUMS" | cut -d' ' -f1)" = 37c3cefbf403b7baa2da480bd2a4b28d1940bf285a0c4d94d9ec23b36bc0360b
(cd "$stage" && sha256sum --check SHA256SUMS >/dev/null)
sudo -n install -d -m 0755 "$base/releases/20260920-v20-invited"
sudo -n install -d -m 0700 "$base/secrets"
sudo -n cp -a "$stage/." "$base/releases/20260920-v20-invited/"
sudo -n chown -R root:root "$base/releases/20260920-v20-invited"
sudo -n chmod 0755 "$base/releases/20260920-v20-invited"
sudo -n install -o root -g root -m 0644 /tmp/bilge-defter-invited-nginx.conf "$base/nginx.conf"
sudo -n ln -s "$base/releases/20260920-v20-invited" "$base/current"
docker ps --format '{{.Names}}|{{.ID}}' | sort > "$stage/before-containers.txt"
docker run -d --name bilge-defter-invited-web --restart unless-stopped --read-only \
 --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
 --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
 -p 127.0.0.1:18790:80 -v "$base/current:/usr/share/nginx/html:ro" \
 -v "$base/nginx.conf:/etc/nginx/conf.d/default.conf:ro" "$image"
curl --retry 5 --retry-all-errors --retry-delay 1 --fail --silent --show-error http://127.0.0.1:18790/ -o "$stage/served.html"
cmp "$stage/served.html" "$base/current/index.html"
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18790/SHA256SUMS)" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18790/README.md)" = 404
docker ps --format '{{.Names}}|{{.ID}}' | grep -v '^bilge-defter-invited-web|' | sort > "$stage/after-containers.txt"
cmp "$stage/before-containers.txt" "$stage/after-containers.txt"
echo 'New localhost origin verified; existing containers unchanged.'
