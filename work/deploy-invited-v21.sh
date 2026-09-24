#!/usr/bin/env bash
set -euo pipefail
base=/opt/bilge-defter-invited
previous=$base/releases/20260920-v20-invited
release=$base/releases/20260920-v21-media
stage=/tmp/bilge-defter-invited-v21-media
backup=bilge-defter-invited-web-rollback-v20
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test "$(readlink -f "$base/current")" = "$previous"
test "$(sha256sum "$previous/SHA256SUMS" | cut -d' ' -f1)" = 37c3cefbf403b7baa2da480bd2a4b28d1940bf285a0c4d94d9ec23b36bc0360b
test "$(docker inspect bilge-defter-invited-web --format '{{.Id}}')" = 1cb64293b94445cd0f744cb4e1a40f30f58226e9f3a0d60ce81b0d1280b42978
test "$(docker inspect bilge-defter-invited-web --format '{{.State.Status}}')" = running
test ! -e "$release"
test ! -e "$stage"
test ! -e "$base/nginx-v21.conf"
! docker container inspect "$backup" >/dev/null 2>&1
mkdir -m 0700 "$stage"
tar -xzf /tmp/bilge-defter-invited-v21.tar.gz -C "$stage"
test "$(sha256sum "$stage/SHA256SUMS" | cut -d' ' -f1)" = 32a4f7cbaf48036671b677efeeaa2892f941686dac42e3474a4e5a6750e48425
(cd "$stage" && sha256sum --check SHA256SUMS >/dev/null)
sudo -n install -d -m 0755 "$release"
sudo -n cp -a "$stage/." "$release/"
sudo -n chown -R root:root "$release"
sudo -n install -m 0644 /tmp/bilge-defter-invited-nginx-v21.conf "$base/nginx-v21.conf"
docker ps --format '{{.Names}}|{{.ID}}' | grep -v '^bilge-defter-invited-web|' | sort > "$stage/other-containers-before.txt"
docker stop bilge-defter-invited-web >/dev/null
docker rename bilge-defter-invited-web "$backup"
restore(){ status=$?; if [ "$status" -ne 0 ]; then
 if docker container inspect bilge-defter-invited-web >/dev/null 2>&1; then docker rm -f bilge-defter-invited-web >/dev/null; fi
 sudo -n ln -sfn "$previous" "$base/current"
 docker rename "$backup" bilge-defter-invited-web
 docker start bilge-defter-invited-web >/dev/null
 fi; exit "$status"; }
trap restore EXIT
sudo -n ln -sfn "$release" "$base/current"
docker run -d --name bilge-defter-invited-web --restart unless-stopped --read-only \
 --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
 --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
 -p 127.0.0.1:18790:80 -v "$base/current:/usr/share/nginx/html:ro" \
 -v "$base/nginx-v21.conf:/etc/nginx/conf.d/default.conf:ro" "$image"
curl --retry 5 --retry-all-errors --retry-delay 1 --fail --silent --show-error http://127.0.0.1:18790/ -o "$stage/served.html"
cmp "$stage/served.html" "$release/index.html"
for file in media-workspace.js sw.js offline-assets.json; do
 curl -fsS "http://127.0.0.1:18790/$file" -o "$stage/served-$file"
 cmp "$stage/served-$file" "$release/$file"
done
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18790/README.md)" = 404
docker ps --format '{{.Names}}|{{.ID}}' | grep -v '^bilge-defter-invited-web|' | sort > "$stage/other-containers-after.txt"
cmp "$stage/other-containers-before.txt" "$stage/other-containers-after.txt"
curl -fsS http://127.0.0.1:18789/ready
echo 'v21 deployed; other containers unchanged; v20 rollback retained.'
trap - EXIT
