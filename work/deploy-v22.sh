#!/usr/bin/env bash
set -euo pipefail
profile=${1:?profile required}
case "$profile" in
 invited)
  base=/opt/bilge-defter-invited; name=bilge-defter-invited-web; previous=$base/releases/20260920-v21-media; port=18790
  expected=858b35bfe078f978342376e3fea2a6f3f076dff115c7b9dcbbd928dd07176799
  oldhash=32a4f7cbaf48036671b677efeeaa2892f941686dac42e3474a4e5a6750e48425
  bindings=(-p 127.0.0.1:18790:80) ;;
 private)
  base=/opt/bilge-defter-test; name=bilge-defter-test; previous=$base/releases/20260920-215523; port=18787
  expected=f5a638cdb85d5e4ea31d4ab882c94a7dcf6adaf36c8f3655ce13a5597ef23b12
  oldhash=df641d2d09160f6ab54981111ff16e7c2d216097a771ca7afce3fb61add5b3a0
  bindings=(-p 127.0.0.1:18787:80 -p 100.84.251.49:18788:80) ;;
 *) exit 2 ;;
esac
release=$base/releases/20260920-v22-ui; stage=/tmp/bilge-defter-v22-$profile; backup=$name-rollback-before-v22
image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
test "$(readlink -f "$base/current")" = "$previous"
test "$(sha256sum "$previous/SHA256SUMS" | cut -d' ' -f1)" = "$oldhash"
test "$(docker inspect "$name" --format '{{.Id}}')" = "$expected"
test "$(docker inspect "$name" --format '{{.State.Status}}')" = running
test "$(docker inspect "$name" --format '{{.Image}}')" = "$image"
test ! -e "$release"; test ! -e "$stage"; test ! -e "$base/nginx-v22.conf"
! docker container inspect "$backup" >/dev/null 2>&1
mkdir -m 0700 "$stage"
tar -xzf /tmp/bilge-defter-v22.tar.gz -C "$stage"
test "$(sha256sum "$stage/SHA256SUMS" | cut -d' ' -f1)" = 6a49d4b087bf6af9d1c77765f775dc303628caa77d83584a1889b590f716573d
(cd "$stage" && sha256sum --check SHA256SUMS >/dev/null)
sudo -n install -d -m 0755 "$release"
sudo -n cp -a "$stage/." "$release/"
sudo -n chown -R root:root "$release"
sudo -n install -m 0644 /tmp/bilge-defter-nginx-v22.conf "$base/nginx-v22.conf"
docker ps --format '{{.Names}}|{{.ID}}' | grep -v "^$name|" | sort > "$stage/others-before.txt"
docker stop "$name" >/dev/null
docker rename "$name" "$backup"
restore(){ status=$?; if [ "$status" -ne 0 ]; then
 if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null; fi
 sudo -n ln -sfn "$previous" "$base/current"
 docker rename "$backup" "$name"; docker start "$name" >/dev/null
 fi; exit "$status"; }
trap restore EXIT
sudo -n ln -sfn "$release" "$base/current"
docker run -d --name "$name" --restart unless-stopped --read-only \
 --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
 --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
 "${bindings[@]}" -v "$base/current:/usr/share/nginx/html:ro" \
 -v "$base/nginx-v22.conf:/etc/nginx/conf.d/default.conf:ro" "$image"
for file in index.html ui-workspace.js ui.css media-workspace.js pwa.js sw.js offline-assets.json release.json; do
 curl --retry 5 --retry-all-errors --retry-delay 1 --fail --silent --show-error "http://127.0.0.1:$port/$file" -o "$stage/served-$file"
 cmp "$stage/served-$file" "$release/$file"
done
test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/README.md")" = 404
docker ps --format '{{.Names}}|{{.ID}}' | grep -v "^$name|" | sort > "$stage/others-after.txt"
cmp "$stage/others-before.txt" "$stage/others-after.txt"
echo "$profile v22 verified; other containers unchanged; previous release retained."
trap - EXIT
