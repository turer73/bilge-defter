#!/usr/bin/env bash
set -euo pipefail
stage=/opt/bilge-defter-classroom-v49
old=/opt/bilge-defter-invited/releases/20260923-v46-session-uyari
old_id=5cea3ff264d56ae0fae982ff6a38f9d6e8cc50469a4dd69074d07227dec7bf14
old_hash=a364d7c99d16a28bd5711034ee12a1edfa8ba2b8592c420f31b18df0c6365f8a
new_hash=8221c3e8c8da75d4ba6cb2d2d261db499c2486bc5e0d4d1cbb3af01692f13fff
nginx_image=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
mode=${1:-check}
api(){
  docker run -d --name bilge-defter-accounts --restart unless-stopped --network bilge-defter-classroom \
    --read-only --memory 768m --cpus 1.5 --pids-limit 150 --cap-drop ALL --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m --env-file "$stage/classroom.env" -e "BILGE_DEFTER_EDGE_SYNC=$1" \
    -v "$stage/data:/data" -v "$stage/secrets:/run/bilge-secrets:ro" bilge-defter-accounts:v49 >/dev/null
}
check_old(){
  test "$(readlink -f /opt/bilge-defter-invited/current)" = "$old"
  test "$(docker inspect bilge-defter-invited-web --format '{{.Id}}')" = "$old_id"
  test "$(sha256sum "$old/SHA256SUMS" | cut -d' ' -f1)" = "$old_hash"
  test "$(sha256sum /opt/linux-ai-server/app/api/bilge_defter.py | cut -d' ' -f1)" = d5e0480a5bd2d12417836c40808ffae291c5c53518b5ec04004c6da50263950a
}
check_package(){
  test "$(sha256sum "$stage/ui/SHA256SUMS" | cut -d' ' -f1)" = "$new_hash"
  (cd "$stage/ui" && sha256sum --check SHA256SUMS >/dev/null)
}
web(){
  docker run -d --name "$1" --restart unless-stopped --network bilge-defter-classroom --read-only \
    --memory 128m --cpus 0.5 --pids-limit 100 \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
    --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
    -p "127.0.0.1:$2:80" -v "$stage/ui:/usr/share/nginx/html:ro" \
    -v "$stage/classroom-nginx.conf:/etc/nginx/conf.d/default.conf:ro" "$nginx_image" >/dev/null
}
case "$mode" in
  check)
    check_old; check_package
    printf 'Existing v46 and candidate package match expected hashes. No publication changes.\n'
    ;;
  stage)
    check_old; check_package
    ! docker container inspect bilge-defter-accounts >/dev/null 2>&1
    ! docker container inspect bilge-defter-classroom-preview >/dev/null 2>&1
    ! docker network inspect bilge-defter-classroom >/dev/null 2>&1
    sudo -n install -d -m 0700 "$stage/data" "$stage/secrets"
    sudo -n chown +10001:+10001 "$stage/data" "$stage/secrets"
    docker network create bilge-defter-classroom >/dev/null
    api 0
    web bilge-defter-classroom-preview 18791
    sleep 2
    docker exec bilge-defter-accounts python -c 'import urllib.request,json; assert json.load(urllib.request.urlopen("http://127.0.0.1:8080/health"))["account_protocol"]=="approval-v1"'
    test "$(curl --retry 3 --retry-all-errors --retry-delay 1 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18791/api/v1/bilge-defter/admin/members)" = 401
    curl --fail -s http://127.0.0.1:18791/account-workspace.js | cmp - "$stage/ui/account-workspace.js"
    check_old
    printf 'Isolated production runtime and preview verified. Public v46 unchanged; edge sync disabled.\n'
    ;;
  activate)
    # Must be deliberately invoked after credential choice, backup and cutover approval.
    check_old; check_package
    sudo -n test -s "$stage/secrets/cloudflare-token"
    ! docker container inspect bilge-defter-invited-web-rollback-v49 >/dev/null 2>&1
    test "$(docker inspect bilge-defter-accounts --format '{{.State.Status}}')" = running
    # Only the new isolated backend is restarted, never linux-ai-server or Bilge Arena.
    docker stop bilge-defter-accounts >/dev/null
    docker rm bilge-defter-accounts >/dev/null
    api 1
    sleep 2
    # This must verify the existing two-admin policy unchanged before public cutover.
    docker exec bilge-defter-accounts python -c 'from app.api import bilge_defter_edge as e; r=e.reconcile("/data/bilge-defter.sqlite","turgut.urer@gmail.com"); assert r["state"]=="verified" and r["allowed"]==2, r; print("Two-admin external policy verified")'
    check_old
    docker stop bilge-defter-invited-web >/dev/null
    restore(){ status=$?; if [ "$status" -ne 0 ]; then
      # No student admission is performed by this script. Existing policy stays two-admin.
      if docker container inspect bilge-defter-invited-web-rollback-v49 >/dev/null 2>&1; then
        if docker container inspect bilge-defter-invited-web >/dev/null 2>&1; then docker rm -f bilge-defter-invited-web >/dev/null; fi
        docker rename bilge-defter-invited-web-rollback-v49 bilge-defter-invited-web
      fi
      docker start bilge-defter-invited-web >/dev/null
      sudo -n ln -sfn "$old" /opt/bilge-defter-invited/current
      printf 'Activation failed; old publication restored. New database retained.\n' >&2
    fi; exit "$status"; }
    trap restore EXIT
    # Source path is the previously verified monolith DB; read-only, selected table only.
    sudo -n python3 "$stage/migrate-classroom.py" /opt/linux-ai-server/data/claude_memory.db "$stage/data/bilge-defter.sqlite"
    sudo -n python3 "$stage/backup-classroom.py" "$stage/data/bilge-defter.sqlite" "$stage/data/before-public-v49.sqlite"
    sudo -n chown +10001:+10001 "$stage/data/bilge-defter.sqlite" "$stage/data/before-public-v49.sqlite"
    sudo -n chmod 0600 "$stage/data/bilge-defter.sqlite" "$stage/data/before-public-v49.sqlite"
    docker rename bilge-defter-invited-web bilge-defter-invited-web-rollback-v49
    web bilge-defter-invited-web 18790
    curl --retry 5 --retry-all-errors --retry-delay 1 --fail -s http://127.0.0.1:18790/account-workspace.js | cmp - "$stage/ui/account-workspace.js"
    test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18790/api/v1/bilge-defter/admin/members)" = 401
    sudo -n ln -sfn "$stage/ui" /opt/bilge-defter-invited/current
    trap - EXIT
    printf 'Invited v49 published. Private address and other services unchanged. Real account browser acceptance is still required.\n'
    ;;
  *) printf 'Use check, stage, or explicitly approved activate.\n' >&2; exit 2 ;;
esac
