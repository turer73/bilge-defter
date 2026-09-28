# İzleme ve uyarı

28 Eylül 2026. İnceleme raporunun ([INCELEME_2026-09-28](INCELEME_2026-09-28.md)) B1 maddesi.

## Neden bu yol

Ölçüm (28 Eylül): Uptime Kuma'da 8 monitör var ama **bildirim kanalı yok** (0 bildirim); yani
Kuma yalnız gösterge, kimseye haber vermiyor. Telegram'a ulaşan tek yol klipper'ın kendi
otomasyonu: `klipper-cron-wrap.sh` işin çıktısındaki son `OUTCOME: pass|fail | ayrıntı`
satırını `cron_outcomes` tablosuna yazar, `notify-cron` bunları Telegram'a taşır. Devops ajanı
da `MONITOR_CRITICAL_CONTAINERS` listesindeki konteynerleri "durdu/sağlıksız" için izler ve
gerekirse yeniden başlatır; bilge-defter konteynerleri o listede değildi.

Bu yüzden B1 üç parçaya ayrıldı: (1) bu depoda bir denetim betiği (aşağıda), (2) klipper
tarafında cron satırı ve kritik konteyner listesi (görev notu), (3) konteyner sağlık
kontrolleri bir sonraki yayının kurulum betiğine (v68).

## Denetim betiği: `work/monitor/bilge-defter-health.sh`

Klipper'da `/opt/bilge-defter-monitor/bilge-defter-health.sh` olarak kurulur; docker grubu
yeter, sudo istemez. Her koşuda 15 kontrol, birkaç saniye:

| # | Kontrol | Geçiş koşulu | Yakaladığı arıza |
|---|---|---|---|
| 1 | Web `release.json` | 200 ve sürüm, `current` bağının gösterdiği dizinle aynı | nginx kapalı, yanlış sürüm/bağ, yarım yayın |
| 2 | Hesap servisi nginx üzerinden | kimliksiz `whoami` 200 | accounts kapalı ya da nginx→accounts yolu kopuk |
| 3 | Hesap servisi içi (`docker exec`) | `/health` sürüm döndürüyor; veritabanı salt okunur açılıp `quick_check` ok ve üye sayısı okunuyor | DB kilidi, kopuk `/data` bağı, bozulma (`whoami` veritabanına dokunmaz) |
| 4 | Kimlik kapısı | kimliksiz `dictionaries` 401 | kapının yanlışlıkla açılması |
| 5 | Kütüphane nginx üzerinden | kimliksiz `/library/api/catalog` 401 | nginx→library yolu kopuk (502/504), kapı açık (200) |
| 6 | Dört konteyner | `running` (sağlık kontrolü olanlar `healthy`) | konteyner durması, kütüphane sağlıksız |
| 7 | Tünel | cloudflared'ın `127.0.0.1:18789/ready` ucu 200 | tünelin Cloudflare'a bağlı olmaması (konteyner "running" olsa da) |
| 8 | Genel adres | oturumsuz istek 302 → `*.cloudflareaccess.com` | DNS ya da Access uygulamasının kalkması (Access 302'yi kenarda verir; tünel kanıtı 7) |
| 9 | Yedek tazeliği | son `bilge-defter-accounts-*.tar.gz` ≤ 27 saat | gece yedeğinin çalışmaması |
| 10 | Disk | `/` ≥ 5 GB, `/backups` ≥ 1 GB boş | disk dolması |

Çıktıda kimlik, e-posta, not içeriği, token ya da sır yok; yalnız durum kodları, sürüm adları,
konteyner durumu, yedek yaşı ve boş alan. Ayrıntı tek satıra indirgenir; tırnak, `|` ve
yazdırılamayan karakterler temizlenir, 240 karakterle sınırlanır (sarmalayıcının SQL yazımı
için). HTTP kontrolleri geçici ağ hıçkırıklarına karşı iki kez yeniden denenir. Betik
beklenmedik biçimde kesilse bile (`trap EXIT`) son satır OUTCOME olur.

Karşıt inceleme (14 ajan, 3 lens) bu sürümü şekillendirdi: ilk taslak tüneli hiç sınamıyordu
(Access 302'si tünel kopukken de gelir), veritabanına dokunmuyordu ve kütüphane yolunu
atlıyordu; üçü eklendi. Reddedilen öneriler: yedek gecikmesini "partial" saymak, sürüm
metnini şüpheli girdi saymak, ortam değişkenlerini doğrulamak.

Doğrulama (28 Eylül, klipper): gerçek hedeflerle 15/15 geçti; yanlış hedeflerle (kapalı port,
olmayan alan adı, olmayan yedek dizini, olmayan konteyner) düşen kontroller `FAIL` satırı
üretti, çıkış 1, OUTCOME son satırda tek satır.

Elle çalıştırma:

```sh
/opt/bilge-defter-monitor/bilge-defter-health.sh
```

## Klipper tarafı (görev notu ile istendi)

1. Root crontab'a (linux-ai-server `automation/crontab`, `install-cron.sh`):
   `*/5 * * * * /opt/linux-ai-server/scripts/klipper-cron-wrap.sh bilge-defter-health /opt/bilge-defter-monitor/bilge-defter-health.sh`
2. `.env`'de `MONITOR_CRITICAL_CONTAINERS` listesine `bilge-defter-invited-web,bilge-defter-accounts,bilge-defter-library-v1,bilge-defter-invited-cloudflared` (servis yeniden başlatma gerekir; yayın penceresi dışında).
3. Yayın sırasında (web konteynerinin durdurulup yenisinin doğrulanması; `activate` içinde
   `verify(18790)` bitene kadar sürüm bağı eski kalır, tipik olarak 10–30 saniye) bir koşu
   düşebilir; `notify-cron` tek koşuluk düşüşü nasıl ele alıyorsa öyle kalsın, ayrı susturma
   eklenmedi. Yayın yapan zaten başındadır.

## Ertelenenler ve sınırlar

- **Konteyner sağlık kontrolü** web ve accounts'ta yok. Çalışan konteynere sonradan
  eklenemez; bir sonraki yayının kurulum betiğinde (`deploy-v68`) `--health-cmd` ile gelir:
  web için `curl -fsS http://127.0.0.1/release.json`, accounts için `python -c urllib
  /health`. Ondan sonra devops ajanı "sağlıksız" durumunda yeniden başlatabilir.
- **Uygulama yolunun kimlikli denetimi yok.** Denetim kimliksiz uçlarla yetiniyor; onaylı bir
  hesabın sözlük araması ya da yedek okuması ölçülmüyor. Bunun için Cloudflare Access servis
  belirteci gerekir (Cloudflare tarafında oluşturulur; anahtar döndürme işiyle, A3, birlikte
  düşünülmeli).
- **Kuma** dış görünüm için kalabilir: `https://defter.bilgearena.com` için "302 bekle"
  monitörü ve bir Telegram bildirimi Kuma arayüzünden eklenirse ikinci bir göz olur. Bu belge
  onu zorunlu saymıyor.
- Hesap veritabanı kilitlenmesi (`database is locked`) `whoami`'de görünmeyebilir; sözlük ya
  da yedek uçları kimlik istediği için betikten ölçülemiyor. Konteyner sağlık kontrolü ve
  `/health` bunun için yeterli değil; gerçek kullanım şikâyetleri bu boşluğa düşer.
