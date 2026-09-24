#!/usr/bin/env bash
set -euo pipefail
stage=/opt/bilge-defter-classroom-v50
prior=/opt/bilge-defter-classroom-v49
nginx=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
old_api=011c685f68a41e315f18a2185df1fc2ab7b13d56815c1c864e22e78f20065a73
old_web=a670fde60fc69a6fde68aef81775352e037142bbd4b69d640e9e1aa8def21526
check_other(){
  test "$(readlink -f /opt/bilge-defter-test/current)" = /opt/bilge-defter-test/releases/20260923-v46-session-uyari
  test "$(sha256sum /opt/linux-ai-server/app/api/bilge_defter.py | cut -d' ' -f1)" = d5e0480a5bd2d12417836c40808ffae291c5c53518b5ec04004c6da50263950a
  test "$(systemctl show linux-ai-server -p MainPID --value)" = 2699214
}
check_old(){
  test "$(readlink -f /opt/bilge-defter-invited/current)" = "$prior/ui"
  test "$(docker inspect bilge-defter-accounts --format '{{.Id}}')" = "$old_api"
  test "$(docker inspect bilge-defter-invited-web --format '{{.Id}}')" = "$old_web"
  test "$(sha256sum "$prior/ui/SHA256SUMS" | cut -d' ' -f1)" = 8221c3e8c8da75d4ba6cb2d2d261db499c2486bc5e0d4d1cbb3af01692f13fff
  check_other
}
check_package(){
  test "$(sha256sum "$stage/ui/SHA256SUMS" | cut -d' ' -f1)" = 6f76ccc48d888acb5aa096d983f1c76b0304e521b188bbabc4c97c68e4dd63e6
  (cd "$stage/ui" && sha256sum --check SHA256SUMS >/dev/null)
  (cd "$stage/backend" && sha256sum --check SOURCE_SHA256SUMS >/dev/null)
}
api(){
  docker run -d --name "$1" --restart unless-stopped --network bilge-defter-classroom \
    --read-only --memory 768m --cpus 1.5 --pids-limit 150 --cap-drop ALL --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m --env-file "$prior/classroom.env" -e "BILGE_DEFTER_EDGE_SYNC=$3" \
    -v "$2:/data" ${4:+--mount=type=bind,src=$prior/secrets,dst=/run/bilge-secrets,readonly} \
    bilge-defter-accounts:v50 >/dev/null
}
web(){
  docker run -d --name "$1" --restart unless-stopped --network bilge-defter-classroom --read-only \
    --memory 128m --cpus 0.5 --pids-limit 100 \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
    --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
    -p "127.0.0.1:$2:80" -v "$stage/ui:/usr/share/nginx/html:ro" \
    -v "$3:/etc/nginx/conf.d/default.conf:ro" "$nginx" >/dev/null
}
health(){
  for attempt in {1..15}; do
    if docker exec "$1" python -c 'import urllib.request,json; r=json.load(urllib.request.urlopen("http://127.0.0.1:8080/health",timeout=2)); assert r["version"]=="v50" and r["account_protocol"]=="approval-v1"' 2>/dev/null; then return; fi
    sleep 1
  done
  return 1
}
case "${1:-check}" in
  stage)
    check_old; check_package
    ! docker container inspect bilge-defter-accounts-preview-v50 >/dev/null 2>&1
    ! docker container inspect bilge-defter-web-preview-v50 >/dev/null 2>&1
    install -d -m 0700 "$stage/preview-data"
    chown +10001:+10001 "$stage/preview-data"
    sed 's/bilge-defter-accounts:8080/bilge-defter-accounts-preview-v50:8080/g' "$prior/classroom-nginx.conf" > "$stage/preview-nginx.conf"
    api bilge-defter-accounts-preview-v50 "$stage/preview-data" 0 ''
    health bilge-defter-accounts-preview-v50
    web bilge-defter-web-preview-v50 18792 "$stage/preview-nginx.conf"
    sleep 2
    python3 "$stage/verify-publication-v50.py" "$stage/ui" 18792
    check_old
    printf 'v50 preview passed. Public v49 unchanged. No production data or credentials mounted in preview.\n'
    ;;
  activate)
    check_old; check_package
    health bilge-defter-accounts-preview-v50
    python3 "$stage/verify-publication-v50.py" "$stage/ui" 18792
    ! docker container inspect bilge-defter-accounts-rollback-v50 >/dev/null 2>&1
    ! docker container inspect bilge-defter-invited-web-rollback-v50 >/dev/null 2>&1
    test -s "$prior/secrets/cloudflare-token"
    test -s "$prior/data/bilge-defter.sqlite"
    test ! -e "$stage/before-v50.sqlite"
    rollback(){
      status=$?
      if [ "$status" -ne 0 ]; then
        set +e
        for pair in 'bilge-defter-invited-web' 'bilge-defter-accounts'; do
          if docker container inspect "$pair-rollback-v50" >/dev/null 2>&1; then
            if docker container inspect "$pair" >/dev/null 2>&1; then
              docker stop "$pair" >/dev/null
              docker rename "$pair" "$pair-failed-v50"
            fi
            docker rename "$pair-rollback-v50" "$pair"
          fi
        done
        docker start bilge-defter-accounts >/dev/null
        sleep 2
        docker start bilge-defter-invited-web >/dev/null
        ln -sfn "$prior/ui" /opt/bilge-defter-invited/current
        printf 'Activation failed. v49 containers restored, live database retained.\n' >&2
      fi
      exit "$status"
    }
    trap rollback EXIT
    docker stop bilge-defter-invited-web >/dev/null
    docker stop bilge-defter-accounts >/dev/null
    umask 077
    python3 "$prior/backup-classroom.py" "$prior/data/bilge-defter.sqlite" "$stage/before-v50.sqlite" > "$stage/backup-receipt.json"
    chmod 0600 "$stage/before-v50.sqlite"
    docker rename bilge-defter-accounts bilge-defter-accounts-rollback-v50
    docker rename bilge-defter-invited-web bilge-defter-invited-web-rollback-v50
    api bilge-defter-accounts "$prior/data" 1 yes
    health bilge-defter-accounts
    web bilge-defter-invited-web 18790 "$prior/classroom-nginx.conf"
    sleep 2
    python3 "$stage/verify-publication-v50.py" "$stage/ui" 18790
    check_other
    ln -sfn "$stage/ui" /opt/bilge-defter-invited/current
    trap - EXIT
    docker stop bilge-defter-web-preview-v50 bilge-defter-accounts-preview-v50 >/dev/null
    printf 'Invited v50 active. Both v49 containers retained for rollback; same live database and policy configuration.\n'
    ;;
  check) check_old; check_package ;;
  *) exit 2 ;;
esac
