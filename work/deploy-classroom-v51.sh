#!/usr/bin/env bash
set -euo pipefail
stage=/opt/bilge-defter-classroom-v51
prior=/opt/bilge-defter-classroom-v50
old_web=0470f4380eaeee664cfceb6a4e421b40b7ec4db21411b028e5891bd1ed83a711
api_id=faa96ab52e4d82f119d279d0bee536432448e01c38687ff743bd2d23840b4625
nginx=sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
check_unchanged(){
  test "$(docker inspect bilge-defter-accounts --format '{{.Id}}')" = "$api_id"
  test "$(docker inspect bilge-defter-accounts --format '{{.State.StartedAt}}')" = 2026-09-23T19:24:15.128690167Z
  test "$(docker inspect bilge-defter-accounts --format '{{.State.Status}}')" = running
  test "$(docker inspect bilge-defter-invited-cloudflared --format '{{.Id}}')" = faf8701dc1e2f2ec19948d3dd34b329e3b4da53c1b7107a181ddb66b0a9d4dd2
  test "$(readlink -f /opt/bilge-defter-test/current)" = /opt/bilge-defter-test/releases/20260923-v46-session-uyari
  test "$(sha256sum /opt/linux-ai-server/app/api/bilge_defter.py | cut -d' ' -f1)" = d5e0480a5bd2d12417836c40808ffae291c5c53518b5ec04004c6da50263950a
  test "$(systemctl show linux-ai-server -p MainPID --value)" = 2699214
}
check_old(){
  check_unchanged
  test "$(docker inspect bilge-defter-invited-web --format '{{.Id}}')" = "$old_web"
  test "$(readlink -f /opt/bilge-defter-invited/current)" = "$prior/ui"
  test "$(sha256sum "$prior/ui/SHA256SUMS" | cut -d' ' -f1)" = 6f76ccc48d888acb5aa096d983f1c76b0304e521b188bbabc4c97c68e4dd63e6
}
check_package(){
  test "$(sha256sum "$stage/ui/SHA256SUMS" | cut -d' ' -f1)" = d8dced929378581fa199786342ee21dcb3a7e26dd9454083c8564ccda8386fb4
  test "$(sha256sum "$stage/classroom-nginx.conf" | cut -d' ' -f1)" = 505cd65af68387806b9a70121117e2bd71183e81d2952b403d5de58cbe55771a
  (cd "$stage/ui" && sha256sum --check SHA256SUMS >/dev/null)
}
web(){
  docker run -d --name "$1" --restart unless-stopped --network bilge-defter-classroom --read-only \
    --memory 128m --cpus 0.5 --pids-limit 100 \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m --tmpfs /var/run:rw,noexec,nosuid,size=1m \
    --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true \
    -p "127.0.0.1:$2:80" -v "$stage/ui:/usr/share/nginx/html:ro" \
    -v "$stage/classroom-nginx.conf:/etc/nginx/conf.d/default.conf:ro" "$nginx" >/dev/null
}
case "${1:-check}" in
  check) check_old; check_package ;;
  stage)
    check_old; check_package
    ! docker container inspect bilge-defter-web-preview-v51 >/dev/null 2>&1
    web bilge-defter-web-preview-v51 18793
    sleep 2
    docker exec bilge-defter-web-preview-v51 nginx -t
    python3 "$stage/verify-publication-v51.py" "$stage/ui" 18793 | tee "$stage/preview-receipt.json"
    check_old
    ;;
  activate)
    check_old; check_package
    python3 "$stage/verify-publication-v51.py" "$stage/ui" 18793
    ! docker container inspect bilge-defter-invited-web-rollback-v51 >/dev/null 2>&1
    ! docker container inspect bilge-defter-invited-web-failed-v51 >/dev/null 2>&1
    restore(){
      status=$?
      if [ "$status" -ne 0 ]; then
        set +e
        if docker container inspect bilge-defter-invited-web-rollback-v51 >/dev/null 2>&1; then
          if docker container inspect bilge-defter-invited-web >/dev/null 2>&1; then
            docker stop bilge-defter-invited-web >/dev/null
            docker rename bilge-defter-invited-web bilge-defter-invited-web-failed-v51
          fi
          docker rename bilge-defter-invited-web-rollback-v51 bilge-defter-invited-web
        fi
        docker start bilge-defter-invited-web >/dev/null
        ln -sfn "$prior/ui" /opt/bilge-defter-invited/current
        printf 'Activation failed; v50 web restored. API and database untouched.\n' >&2
      fi
      exit "$status"
    }
    trap restore EXIT
    docker stop bilge-defter-invited-web >/dev/null
    docker rename bilge-defter-invited-web bilge-defter-invited-web-rollback-v51
    web bilge-defter-invited-web 18790
    sleep 2
    docker exec bilge-defter-invited-web nginx -t
    python3 "$stage/verify-publication-v51.py" "$stage/ui" 18790 | tee "$stage/origin-receipt.json"
    check_unchanged
    ln -sfn "$stage/ui" /opt/bilge-defter-invited/current
    trap - EXIT
    docker stop bilge-defter-web-preview-v51 >/dev/null
    printf 'v51 UI active. v50 web rollback retained. Accounts API unchanged.\n'
    ;;
  *) exit 2 ;;
esac
