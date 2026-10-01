#!/usr/bin/env bash
# bilge-defter-health.sh — sınıf uygulamasının canlı yolu için periyodik denetim (INCELEME B1).
#
# klipper'da koşar; docker grubu yeter, sudo istemez. Çıktı sözleşmesi klipper-cron-wrap.sh ile
# aynıdır: son satır her koşulda "OUTCOME: pass|fail | ayrıntı". Sarmalayıcı bunu cron_outcomes'a
# yazar, notify-cron Telegram'a taşır. Hiçbir kimlik, not içeriği, token ya da sır yazılmaz; yalnız
# durum kodları, sürüm adları, konteyner durumu, yedek yaşı ve boş disk.
#
# Kanıtladığı: web sürümü canlı bağla aynı; nginx→hesap servisi yolu; hesap veritabanı okunuyor;
# kimlik kapısı kapalı; nginx→kütüphane yolu; dört konteyner çalışıyor; Cloudflare tüneli bağlı;
# genel adres DNS/Access kenarında çözülüyor; gece yedeği taze; disk boş.
# Kanıtlamadığı: onaylı bir hesabın gerçek kullanımı (Access servis belirteci gerekir), web ve
# hesap konteynerinin Docker sağlık kontrolü (yayın betiği, v68), geri dönüş konteynerinin
# varlığı (deploy rehearse), dış görünüm (Kuma).
#
# Ortam değişkenleriyle hedefler değiştirilebilir (testte ve başka makinede):
#   BD_WEB             nginx (http://127.0.0.1:18790)
#   BD_TUNNEL_READY    cloudflared metrics /ready (http://127.0.0.1:18789/ready)
#   BD_PUBLIC          Cloudflare üzerinden genel adres (release.json)
#   BD_CURRENT         canlı sürüm bağı (/opt/bilge-defter-invited/current)
#   BD_ACCOUNTS        hesap servisi konteyneri (docker exec ile /health ve veritabanı)
#   BD_BACKUP_ROOT     günlük yedek kökü (/backups/klipper-volumes)
#   BD_BACKUP_MAX_AGE_H yedek en çok kaç saat eski olabilir (27: 03:10'luk yedek + pay)
#   BD_CONTAINERS      izlenecek konteynerler (boşlukla ayrılmış)
set -u
WEB="${BD_WEB:-http://127.0.0.1:18790}"
TUNNEL_READY="${BD_TUNNEL_READY:-http://127.0.0.1:18789/ready}"
PUBLIC="${BD_PUBLIC:-https://defter.bilgearena.com/release.json}"
CURRENT="${BD_CURRENT:-/opt/bilge-defter-invited/current}"
ACCOUNTS="${BD_ACCOUNTS:-bilge-defter-accounts}"
BACKUP_ROOT="${BD_BACKUP_ROOT:-/backups/klipper-volumes}"
BACKUP_MAX_AGE_H="${BD_BACKUP_MAX_AGE_H:-27}"
CONTAINERS="${BD_CONTAINERS:-bilge-defter-invited-web $ACCOUNTS bilge-defter-library-v1 bilge-defter-invited-cloudflared}"
fails=0; checks=0; details=""; finished=0
# Beklenmedik bir çıkışta (set -u, sinyal) bile son satır OUTCOME olsun.
trap '[ "$finished" = 1 ] || { echo "OUTCOME: fail | bilge-defter: denetim yarida kesildi (${checks} kontrolde)"; }' EXIT
# Ayrıntı tek satır, yazdırılabilir, tırnaksız ve |'siz kalmalı: sarmalayıcı OUTCOME'ı son satırdan okur ve SQL'e yazar.
clean(){ printf '%s' "$1" | tr -d '\n\r'"'"'"' | tr '|' '/' | tr -cd '[:print:]' | cut -c1-240; }
ok(){ checks=$((checks+1)); echo "OK   $(clean "$1")"; }
fail(){ checks=$((checks+1)); fails=$((fails+1)); local d; d=$(clean "$1"); echo "FAIL $d"; details="${details:+$details; }$d"; }
# http URL OUTFILE [TIMEOUT] -> durum kodu. Geçici ağ hıçkırıkları için iki yeniden deneme;
# taşıma hatasında curl zaten 000 basar, boşsa 000.
http(){ local c; c=$(curl -s -o "$2" -w '%{http_code}' --max-time "${3:-8}" --retry 2 --retry-delay 2 --retry-all-errors "$1" 2>/dev/null); printf '%s' "${c:-000}"; }
# Konteyner içinde kısa bir Python; çıktı tek satır, hata boş.
inside(){ docker exec "$ACCOUNTS" python -c "$1" 2>/dev/null | tr -d '\n' | cut -c1-80; }

# 1) Web: release.json sunuluyor ve sürüm, `current` bağının gösterdiği dizinle aynı.
expected=$(basename "$(dirname "$(readlink -f "$CURRENT" 2>/dev/null || echo /x/y)")" | sed -E 's/^bilge-defter-classroom-//')
case "$expected" in v[0-9]|v[0-9][0-9]|v[0-9][0-9][0-9]) ;; *) expected="";; esac
body=$(mktemp); code=$(http "$WEB/release.json" "$body")
ver=$(grep -o '"version":"[^"]*"' "$body" 2>/dev/null | head -1 | cut -d'"' -f4); rm -f "$body"
case "$ver" in v[0-9]|v[0-9][0-9]|v[0-9][0-9][0-9]) ;; *) ver="";; esac
if [ "$code" = 200 ] && [ -n "$ver" ] && [ "$ver" = "$expected" ]; then ok "web $ver"
else fail "web release.json kod=$code surum=${ver:-yok} beklenen=${expected:-?}"; fi

# 2) Hesap servisi nginx üzerinden: kimliksiz whoami cihaz kimliği döndürür (200).
code=$(http "$WEB/api/v1/bilge-defter/whoami" /dev/null)
if [ "$code" = 200 ]; then ok "hesap servisi (nginx-accounts) 200"; else fail "hesap servisi whoami kod=$code"; fi

# 3) Hesap servisi içi: /health sürümü ve veritabanı gerçekten okunuyor (kilit, kopuk bağ, bozulma).
#    whoami veritabanına dokunmadığı için bu ayrı ölçülür. Salt okunur, 3 sn kilit payı.
api_ver=$(inside "import urllib.request,json;print(json.loads(urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).read())['version'])")
case "$api_ver" in v[0-9]|v[0-9][0-9]|v[0-9][0-9][0-9]) ok "hesap /health $api_ver";; *) api_ver=""; fail "hesap /health yanit yok";; esac
db=$(inside "import sqlite3;c=sqlite3.connect('file:/data/bilge-defter.sqlite?mode=ro',uri=True,timeout=3);print(c.execute('pragma quick_check').fetchone()[0],c.execute('select count(*) from bilge_defter_members').fetchone()[0])")
case "$db" in "ok "[0-9]*) ok "hesap veritabani okunuyor";; *) fail "hesap veritabani: ${db:-okunamadi}";; esac

# 4) Kimlik kapısı: kimliksiz sözlük isteği reddedilmeli (401). 200 dönerse kapı açılmış demektir.
code=$(http "$WEB/api/v1/bilge-defter/dictionaries" /dev/null)
if [ "$code" = 401 ]; then ok "kimlik kapisi 401"; else fail "kimlik kapisi: kimliksiz dictionaries kod=$code (401 beklenir)"; fi

# 5) Kütüphane nginx üzerinden: kimliksiz katalog 401 (yol kopuksa 502/504, kapı açıksa 200).
code=$(http "$WEB/library/api/catalog" /dev/null)
if [ "$code" = 401 ]; then ok "kutuphane (nginx-library) 401"; else fail "kutuphane katalog kod=$code (401 beklenir)"; fi

# 6) Konteynerler: çalışıyor; sağlık kontrolü olanlar healthy.
for c in $CONTAINERS; do
  st=$(docker inspect -f '{{.State.Status}}{{if .State.Health}} {{.State.Health.Status}}{{end}}' "$c" 2>/dev/null | tr -d '\n'); [ -n "$st" ] || st=yok
  # "starting": sağlık kontrolünün ilk ~30 saniyesi (v68'den beri web ve hesap konteynerinde de var).
  # Geçicidir; kontrol düşerse Docker birkaç denemede "unhealthy" yapar ve o zaman burada düşer.
  case "$st" in running|"running healthy"|"running starting") ok "konteyner $c $st";; *) fail "konteyner $c $st";; esac
done

# 7) Tünel: cloudflared'ın kendi /ready ucu (host ağı, yalnız loopback) bağlı bağlantı sayısıyla 200 döner.
#    Konteynerin "running" olması bağlı olduğunu göstermez.
code=$(http "$TUNNEL_READY" /dev/null 4)
if [ "$code" = 200 ]; then ok "tunel bagli"; else fail "tunel /ready kod=$code"; fi

# 8) Genel adres: DNS ve Access uygulaması kenarda ayakta -> oturumsuz istek Access girişine 302.
#    Access bu cevabı origin'e inmeden verir; tünel kanıtı 7. kontroldür.
pub=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 12 --retry 2 --retry-delay 2 --retry-all-errors "$PUBLIC" 2>/dev/null); pub=${pub:-000}
case "$pub" in "302 https://"*.cloudflareaccess.com/*) ok "genel adres 302 Access";; *) fail "genel adres: ${pub%% *} (302 Access beklenir)";; esac

# 9) Yedek tazeliği: hesap veritabanının son günlük arşivi sınırdan yeni.
latest=$(ls -t "$BACKUP_ROOT"/*/bilge-defter-accounts-*.tar.gz 2>/dev/null | head -1)
mtime=""; [ -n "$latest" ] && mtime=$(stat -c %Y "$latest" 2>/dev/null)
if [ -n "$mtime" ]; then
  age_h=$(( ( $(date +%s) - mtime ) / 3600 ))
  if [ "$age_h" -le "$BACKUP_MAX_AGE_H" ]; then ok "yedek ${age_h} saat once"; else fail "yedek eski: ${age_h} saat (sinir ${BACKUP_MAX_AGE_H})"; fi
else fail "yedek yok: $BACKUP_ROOT"; fi

# 10) Disk: kök ve yedek birimi.
for m in / /backups; do
  avail=$(df -BG --output=avail "$m" 2>/dev/null | tail -1 | tr -dc 0-9)
  if [ "$m" = / ]; then min=5; else min=1; fi
  if [ "${avail:-0}" -ge "$min" ]; then ok "disk $m ${avail}G bos"; else fail "disk $m ${avail:-?}G bos (en az ${min}G)"; fi
done

finished=1
if [ "$fails" -eq 0 ]; then echo "OUTCOME: pass | bilge-defter web ${expected:-?} api ${api_ver:-?}: ${checks} kontrol"; exit 0; fi
echo "OUTCOME: fail | bilge-defter: ${fails}/${checks} kontrol dustu: ${details}"
exit 1
