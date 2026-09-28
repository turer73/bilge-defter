# Öğrenci verisi yedeği ve geri yükleme

28 Eylül 2026. İnceleme raporunun ([INCELEME_2026-09-28](INCELEME_2026-09-28.md)) A2 maddesi.
Sunucu tarafı klipper oturumu tarafından linux-ai-server deposunda yapıldı (commit `85990ad`,
`automation/backup-docker-volumes.sh`); bu belge o kurulumun bilge-defter açısından bağımsız
ölçümü ve işletim kılavuzudur. Kod bu depoda değil.

## Ne yedekleniyor

| Veri | Canlı yer | Yedek nasıl alınıyor |
|---|---|---|
| Hesap servisi veritabanı (üyeler, onay geçmişi, şifreli sunucu yedekleri) | `bilge-defter-accounts` konteynerinin `/data` bağı → `/opt/bilge-defter-classroom-v49/data/bilge-defter.sqlite` | Konteynerin canlı bağından yol türetilir; SQLite dosyaları içeriğinden ("SQLite format 3") tanınır ve `sqlite3 .backup` (çevrim içi yedek API'si) ile tutarlı kopya alınır; `PRAGMA integrity_check` "ok" değilse başarısız sayılır; `-wal/-shm` arşive girmez |
| Kütüphane yer imleri | `bilge-defter-library-v1` konteynerinin `/state` bağı → `/opt/bilge-defter-library-v1/state/bookmarks.sqlite3` | Aynı yöntem |

Yedeklenmeyenler (bilinçli): `classroom-v49/secrets` (kullanıcı kararı, sırlar ayrı
saklanır), kütüphane kaynak PDF'leri (`library-v1/sources`, 412 MB, lisanslı orijinaller
başka yerde), sözlük veritabanı (salt okunur, `work/terminology` ve TDK/WikDict girdilerinden
yeniden üretilir).

## Nerede, ne zaman, ne kadar

- Hedef: `/backups/klipper-volumes/<YYYY-MM-DD>/bilge-defter-accounts-<tarih>.tar.gz` ve
  `bilge-defter-library-v1-<tarih>.tar.gz`.
- Zamanlama: root crontab, her gün **03:10** (`klipper-cron-wrap.sh docker-volumes`); hata
  Telegram'a ve `cron_outcomes` tablosuna düşer.
- Saklama: **7 gün** (`VOLBACKUP_RETENTION`).
- `/backups`, `vg-storage/lv-backup` mantıksal biriminde: kökten ayrı bir birim, ama **aynı
  fiziksel disk grubunda**. Yedek yanlış silme, bozulma ve hatalı yayına karşı korur; disk
  ya da sunucu kaybına karşı korumaz. Sunucu dışı kopya açık iş (aşağıda).

## 28 Eylül tatbikatı (bağımsız ölçüm)

Betik elle çalıştırıldı (`OUTCOME: pass | vol 0/0 bind 2/2`), iki arşiv geçici dizine
açıldı, `integrity_check` ikisinde de `ok`; satır sayıları canlı veritabanıyla birebir:

| Tablo | Yedek | Canlı |
|---|---|---|
| `bilge_defter_members` | 2 | 2 |
| `bilge_defter_member_audit` | 2 | 2 |
| `bilge_defter_edge_state` | 1 | 1 |
| `bilge_defter_backups` | 0 | 0 |
| `bookmarks` | 1 | 1 |

Hesap arşivinde eski `before-public-v49.sqlite` kopyası da var (1 üye; 23 Eylül öncesi hâli).

## Geri yükleme (yalnız gerekirse; hesap servisi durdurularak)

1. Önce mevcut canlı dosyayı kenara al, üzerine yazma:
   `sudo cp -a /opt/bilge-defter-classroom-v49/data /opt/bilge-defter-classroom-v49/data.before-restore-$(date +%F-%H%M)`
2. Arşivi geçici dizine aç ve doğrula:
   `sudo mkdir -p /tmp/bd-restore && sudo tar -xzf /backups/klipper-volumes/<tarih>/bilge-defter-accounts-<tarih>.tar.gz -C /tmp/bd-restore`
   `sudo sqlite3 /tmp/bd-restore/bilge-defter.sqlite 'PRAGMA integrity_check; select count(*) from bilge_defter_members;'`
3. Hesap servisini durdur, dosyayı yerine koy, sahipliği koru (uid/gid 10001, 0600), başlat:
   `sudo docker stop bilge-defter-accounts`
   `sudo install -o 10001 -g 10001 -m 600 /tmp/bd-restore/bilge-defter.sqlite /opt/bilge-defter-classroom-v49/data/bilge-defter.sqlite`
   `sudo docker start bilge-defter-accounts`
4. Doğrula: `curl -s http://127.0.0.1:18790/api/v1/bilge-defter/whoami` 200 döner; konteyner
   günlüğünde hata yok; yönetici üye listesini görür.
5. Kütüphane yer imleri için aynı adımlar `bilge-defter-library-v1` (`/state`, sahip klipperos)
   ile.

Geri yükleme öğrencilerin **cihazındaki** notları değiştirmez; yalnız sunucudaki şifreli
kopyalar ve üye listesi döner. Şifreli kopyayı yalnız öğrencinin parolası açar.

## Açık işler

- **Sunucu dışı kopya yok.** `/backups` aynı disk grubunda. Öneri: günlük iki arşivin
  (toplam ~3 KB, ileride şifreli yedeklerle büyür; sınır hesap başına 5 MiB) VPS'e ya da
  kullanıcının bilgisayarına itilmesi. Karar ve CLAIM linux-ai-server tarafında.
- **Gece bütünlük denetimi bu arşivleri taramıyor.** `backup-restore-test.sh` (03:20) yalnız
  `/var/lib/linux-ai-server/backups` altındaki günlük yedeği açıyor; `klipper-volumes`
  arşivleri yalnız oluşturma anında denetleniyor. Klipper'a bildirildi (not #101594).
- **Saklama 7 gün.** Bir öğrencinin yanlışlıkla ezdiği şifreli yedek 7 gün sonra hiçbir yerde
  kalmaz. Sunucuda önceki kopyayı tutma (v68 adayı) bu pencereyi kullanıcıya açar; haftalık
  bir kopyanın 4 hafta saklanması da düşünülebilir.
- Yedek çalışmadığında kim bakacak: Telegram uyarısı klipper'ın `notify-cron` akışına düşer;
  bilge-defter için ayrı sahibi yok (INCELEME B1 ile birlikte çözülmeli).
