# İşletim kılavuzu (tek sayfa)

28 Eylül 2026. Ders öncesi 08:00'de elinde olması gereken her şey. Ayrıntılar bağlantılı
belgelerde; bu sayfa "nereye bakayım, ne yapayım" için.

## 1. Ne, nerede

| Bileşen | Adres / yer | Sürüm | Nasıl bakılır |
|---|---|---|---|
| Uygulama (öğrenci) | https://defter.bilgearena.com (Cloudflare Access, e-posta kodu) | web **v67** | `curl -s http://127.0.0.1:18790/release.json` (klipper) |
| Hesap servisi | konteyner `bilge-defter-accounts`, nginx üzerinden `/api/v1/bilge-defter/` | **v65** | `docker exec bilge-defter-accounts python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8080/health').read())"` |
| Öğrenci verisi | `/opt/bilge-defter-classroom-v49/data/bilge-defter.sqlite` (üyeler, şifreli yedekler) | — | yalnız salt okunur bakılır; sahibi uid 10001 |
| Sözlük | `/opt/bilge-defter-classroom-v57/dictionary` (salt okunur) | 146.532 madde | `…/dictionaries` uçları kimlik ister |
| Kütüphane | konteyner `bilge-defter-library-v1`, `/library/` | v58 | `docker inspect` sağlık durumu |
| Tünel | konteyner `bilge-defter-invited-cloudflared` | — | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18789/ready` → 200 |
| Kaynak | github.com/turer73/bilge-defter, `origin/master` = canlı v67 (yerel `master` bayat olabilir, `git fetch`); çalışma dalı `repair/v57-stability` | | |
| Sunucu | klipper (Tailscale 100.84.251.49, `klipperos`, sudo) | | |

Canlı sürüm bağı: `readlink -f /opt/bilge-defter-invited/current`. Sürüm dizinleri
`/opt/bilge-defter-classroom-vNN`; şu an v49 (veri), v57 (sözlük), v58 (kütüphane), v64–v66
(geri dönüş zinciri), v63 (dosyalar duruyor, otomatik geri dönüş yolu yok), v67 (canlı). Başka
dizin yok; klipper 28 Eylül'de referanssız 13 dizini arşivleyip sildi
(`/backups/archive/bilge-defter-unref-20260928.tar.gz`, 110 MB; not #101593, arşiv 28 Eylül'de
görüldü).

## 2. Sabah kontrolü (30 saniye)

```sh
/opt/bilge-defter-monitor/bilge-defter-health.sh
```

15 kontrol; son satır `OUTCOME: pass` olmalı. Ne ölçtüğü: [IZLEME](IZLEME.md). Betiğin 5
dakikada bir cron'dan koşması ve düşüşün `notify-cron` üzerinden Telegram'a gelmesi klipper'dan
görev paketi BILGE-20260928-01 ile istendi; **28 Eylül 15:00 itibarıyla henüz kurulmadı**
(`cron_outcomes`'ta yalnız elle koşunun tek satırı var). Kurulunca tabloda 5 dakikada bir
`bilge-defter-health | pass` satırı görünür. Kuma yalnız gösterge, uyarı vermez.

## 3. Bir şey çalışmıyorsa

| Belirti | İlk bakış | Sonra |
|---|---|---|
| Sayfa açılmıyor / 5xx | sağlık denetimi; `docker ps` | web konteyneri durmuşsa `docker start bilge-defter-invited-web`; nginx "host not found in upstream" ile başlamıyorsa önce `bilge-defter-library-v1` ve `bilge-defter-accounts` ayakta olmalı (statik upstream, [INCELEME B3](INCELEME_2026-09-28.md)) |
| Giriş dönüp duruyor | genel adres 302 → Access normal; `whoami` 200 mü | Access politikası ya da öğrencinin listede olmaması; bkz. 5 |
| Sözlükte "şu anda kullanılamıyor" uyarısı, yalnız cihazdaki sözlük çalışıyor (API 503 `Sunucu sozlugu su anda kullanilamiyor`) | hesap servisi günlüğü `docker logs --since 10m bilge-defter-accounts` | sözlük DB bağı (`/dictionaries`) ve 0,5 s sınırı |
| Eşitleme "bekliyor" | hesap servisi ve DB dokunması (sağlık denetimi 3) | DB kilidi → konteyneri yeniden başlat; veri dosyasına dokunma |
| Yeni sürüm bozuk | [GERI_DONUS](GERI_DONUS.md) | önce web bir sürüm geri, sağlık denetimi, duyuru |
| Veri kaybı şüphesi | **hiçbir şey silme**; [YEDEK_GERI_YUKLEME](YEDEK_GERI_YUKLEME.md) | önce mevcut dosyayı kenara al, sonra yedeği aç |

Günlükler: `docker logs --since 1h <konteyner>`; nginx erişim günlüğü web konteynerinde
(`?q=` arama terimleri düşüyor, [INCELEME C](INCELEME_2026-09-28.md)). Yayın kayıtları
`/opt/bilge-defter-classroom-vNN/{stage-proof,live-proof,source-receipt}.json`.

## 4. Yayın (yalnız kullanıcı onayıyla)

1. Yerelde: kod + testler (`npm test` PowerShell'den; Git Bash'te `tar` sorunu var), commit.
2. `python work/build-release-vNN.py` → `outputs/vNN-release/payload.tar.gz` (yalnız
   commit'lenmiş dosyalar, hash'li alındı).
3. klipper: `/opt/bilge-defter-classroom-vNN` kur, `deploy-vNN.py prepare` → `stage`
   (127.0.0.1:18800 ön izleme) → `rehearse` (geri dönüş provası) → **onay** → `activate`.
4. Canlı doğrulama: dosya hash'leri Git ile aynı, `current` bağı, geri dönüş konteyneri
   durmuş, genel adres 302. Sürüm notu `docs/RELEASE_VNN.md`.
5. Yayın penceresinde klipper oturumu linux-ai-server'ı yeniden başlatırsa `activate` durur
   (korunan çalışma zamanı farkı); fark ölçülür, yalnız `main_pid` yenilenir
   ([RELEASE_V67](RELEASE_V67.md)). Klipper artık restart öncesi not atıyor.

Şablon: web için `deploy-v67.py`; web + hesap servisi için `deploy-v65.py`. Üç betiğin
`rollback`'i de canlı sürümü ön kontrol etmiyor ([GERI_DONUS](GERI_DONUS.md), "Bilinen kusur");
sonraki araçlar bunu almalı. Sonraki yayın (v68) adayları: sunucuda önceki şifreli kopyayı
saklama, web ve hesap konteynerine Docker sağlık kontrolü, hesap servisi için yeniden kurma
yeteneği ve prova.

## 5. Öğrenci ekleme

1. Yönetici uygulamada **Hesabım ve sınıf** → "Öğrenci e-postası" → **Ekle** ile e-postayı
   listeye alır (`POST /admin/students`); kayıt modu `invitation`: listede olmayan e-posta giriş
   yapsa da "öğrenci listesinde yok" görür.
2. **Başvurular** listesinde **Onayla** (`POST /admin/members/{id}`, durum `approved`). Onay,
   servisin Cloudflare Access politikasına e-postayı yazmasını tetikler (`edge.reconcile`;
   `BILGE_DEFTER_EDGE_SYNC=1`, anahtar `BILGE_DEFTER_CF_TOKEN_FILE` → konteynerde
   `/run/bilge-secrets/cloudflare-token`, sunucuda `v49/secrets/cloudflare-token`). Yazılamazsa
   üye onaylı görünür ama **giriş izni (edge) durumu** `pending` kalır ve öğrenci Access
   kapısından geçemez; "Giriş izinlerini denetle" düğmesi (`/admin/access-sync`) yazımı yeniden
   dener.
3. Öğrenci https://defter.bilgearena.com adresini açar, e-posta kodunu girer, uygulama
   `whoami` ile onayı görür; ilk kez ana ekrana ekleme yönergesi çıkar.
4. Kontenjan 48 öğrenci (`BILGE_DEFTER_MAX_STUDENTS`). Silme uç noktası yok
   ([INCELEME B5](INCELEME_2026-09-28.md)); yanlış e-posta kontenjanı tutar. Askıya alma var.
5. Yeni cihazda notlarına dönmek isteyen öğrenci: giriş → Dosya ve yedek → Kayıt ve eşitleme →
   "Eşitlemeyi aç" + parolası; v67'den beri sunucudaki defter sormadan açılır.

## 6. Sırlar ve süreler

| Sır | Nerede | Kim üretti / ne zaman | Süre | Not |
|---|---|---|---|---|
| Cloudflare **hesap** API anahtarı | Yalnız `CLOUDFLARE_API_TOKEN` kullanıcı ortam değişkeni olmalı (INCELEME A3'teki `CF_API_TOKEN` önerisi yerine bu ad seçildi). 28 Eylül'e kadar `C:\Users\sevdi\Desktop\cloude (2).txt` düz metin dosyasındaydı ve yolu dört betikte sabitti | dosya 20 Eylül tarihli; anahtarın oluşturma tarihi ve süresi yalnız Cloudflare → API Tokens listesinde | panelde belirlenir | **Döndürülmeli:** panelde eskisi iptal, yenisi env değişkenine, dosya silinir; yeni tarih bu tabloya işlenir. Betikler artık dosyadan okumaz |
| Sınıf **servis** anahtarı (izin grupları betikteki adlarıyla: `Access: Apps Read`, `Access: Policies Write`, `Access: Audit Logs Read`, `Billing Read`) | klipper `/opt/bilge-defter-classroom-v49/secrets/cloudflare-token` → konteynerde `/run/bilge-secrets/cloudflare-token` | `create-classroom-token.ps1`, 23 Eylül 2026 20:49 | 365 gün → **23 Eylül 2027** | Dolunca öğrenci onayları Access'e yazılmaz; iki hafta önce yenilenmeli (takvime yaz) |
| Tünel belirteci | sunucuda `/opt/bilge-defter-invited/secrets/tunnel-token` → konteynerde `/run/secrets/tunnel-token` (28 Eylül ölçümü) | konteyner 20 Eylül'de kuruldu | süresiz | Cloudflare Zero Trust → Tunnels'tan yenilenir |
| Hesap servisi ortamı (sır değil, yapılandırma) | konteyner ortamı: `BILGE_DEFTER_ORIGIN`, `ADMIN_EMAILS`, `MAX_STUDENTS`=48, `REGISTRATION_MODE`=invitation, `DB`, `DICT_DB`, `ACCESS_TEAM`, `ACCESS_AUD`, `CF_ACCOUNT`, `CF_APP`, `CF_POLICY`, `CF_IDP`, `CF_TOKEN_FILE`, `EDGE_SYNC`=1 (adlar `server-candidate/v49/app/core/config.py`) | — | — | her yayın `private/*.json` içinde saklar; değer değişikliği yeni hesap servisi yayını demek |
| VAPID anahtarları | hesap servisi ortamı | v3x | — | push kapalı; kalıntı, kaldırılabilir |
| GitHub | `gh` CLI oturumu (turer73) | — | — | Actions ücretsiz kota; faturalama yetkisi CLI'de yok |
| Klipper hafıza API anahtarı | `KLIPPER_MEMORY_KEY` ortam değişkeni | — | — | asla dosyaya yazılmaz |

Her yayın `private/` altında konteyner `inspect` çıktısını (ortam dahil) saklar; dizin 0700,
ama dosyalar uid 1000'e okunur ([INCELEME C](INCELEME_2026-09-28.md)).

## 7. Yedek

Her gün 03:10 hesap veritabanı ve kütüphane yer imleri `/backups/klipper-volumes/<tarih>/`;
7 gün saklanır; aynı disk grubunda, sunucu dışı kopya yok. Geri yükleme adımları ve 28 Eylül
tatbikatı: [YEDEK_GERI_YUKLEME](YEDEK_GERI_YUKLEME.md).

## 8. Kim, ne zaman

- Sahip ve onay: kullanıcı (turer73). Her canlı yayın ve geri dönüş için ayrı, açık onay.
- Klipper oturumu (Opus): sunucu işletimi, yedek, cron, devops ajanı; bilge-defter
  konteyner ve dizinlerine dokunmaz, yayın penceresinde servis yeniden başlatmadan önce not atar.
- surer oturumu (Claude): kod, test, paket, yayın betikleri, klipper üzerindeki bilge-defter
  komutları.
- Codex: bağımsız inceleme; kaynak değiştirmez.
- Açık kabul: fiziksel iPad ve gerçek hesapla 40 dakikalık ders, 3–5 öğrenci pilotu; sonra
  48+2 ([ACCEPTANCE](ACCEPTANCE.md)).
