# v64 geri alma hazırlığı — 27 Eylül 2026

> **Geçersiz (28 Eylül 2026).** Bu belgedeki `/opt/bilge-defter-v64-recovery-20260927/…`
> komutları artık çalışmaz: dizin 28 Eylül'de sunucu temizliğinde kaldırıldı ve yeniden kurulan
> konteyner kayıtlı kimlikle eşleşmiyor. Güncel zincir: [GERI_DONUS](GERI_DONUS.md). Aşağısı
> tarihsel kayıttır. Silinme nedeni sonradan bulundu: 27 Eylül 13:55 `docker system prune -f`
> (disc#1905, [RELEASE_V66](RELEASE_V66.md)).

## Durum

Canlı sürüm **v64** olarak kaldı. Hesap servisi, kütüphane, kullanıcı verileri,
Cloudflare Access, DNS ve diğer uygulamalar değiştirilmedi. Mevcut konteynerlerin
kimlik, çalışma durumu ve başlama zamanı ile ortak servisin PID değeri işlem
öncesi/sonrası aynı kaldı. Gerçek trafik v63'e geçirilmedi.

Önceki denetimde yapılandırma yedeğinin bulunmadığı söylenmişti. Bu yanlıştı:
root yetkili kontrol dosyanın var olduğunu gösterdi. Ancak kayıtlı eski konteyner
kimliği ve `bilge-defter-invited-web-rollback-v64` gerçekten yoktu. Silinme
nedenine ilişkin kanıt yok; otomatik temizleme olduğu varsayılmadı.

## Yapılan onarım

- Özgün v63/v64 paketleri ve kaynak alındıları dosya hashleriyle doğrulandı.
- Özgün v64 `private/bilge-defter-invited-web.json` kaydı değiştirilmedi.
- Kaydın imajı, salt-okunur mount'ları, ortamı, kaynak limitleri, capabilities,
  tmpfs ve log ayarları korunarak iki web konteyneri oluşturuldu.
- `bilge-defter-invited-web-recovery-test-v64`, yalnız `127.0.0.1:18805` üzerinden
  v63'ü sundu; doğrulama sonrası durduruldu. Silinmedi.
- `bilge-defter-invited-web-rollback-v64`, üretim portu `127.0.0.1:18790` için
  oluşturuldu fakat başlatılmadı. `restart=no`: mevcut v64 ile port çakışması
  yaratacak otomatik başlangıç yoktur. Başarılı gerçek geri alma sonrası komut
  `unless-stopped` politikasını geri yükler.
- Yeni kimlik ayrı korumalı kayıtta tutulur. Yayın dosyalarının hash zincirini
  bozmamak için özgün dağıtım betiği veya alındı yeniden yazılmadı.

## Yeni operasyon komutları

Önce salt-okunur hazırlık kontrolü:

```sh
sudo python3 -B /opt/bilge-defter-v64-recovery-20260927/repair-v64-rollback.py check
```

Yalnız ayrıca onaylanmış bir geri alma gerektiğinde:

```sh
sudo python3 -B /opt/bilge-defter-v64-recovery-20260927/repair-v64-rollback.py rollback --confirm-v64-to-v63
```

**Eski `deploy-v64.py rollback` komutunu kullanmayın.** Özgün kayıtta eski,
artık bulunmayan konteyner kimliği yer alıyor. Yeni komut ön kontrollerden sonra
özgün geri alma mantığını yalnız yeni kimlik kaydıyla çalıştırır; DB geri yüklemez.
Farklı canlı sürüm/kimlik, eksik standby veya değişmiş paket varsa canlı web'i
durdurmadan hata verir. `prepare` tekrar çalıştırılarak mevcut kayıtlar ezilmez.

Sunucudaki işlem dizini: `/opt/bilge-defter-v64-recovery-20260927`.
`proof.json` test sonuçlarını; `private/` başlangıç durumunu ve yeni konteyner
kaydını içerir. Private kayıtlar Git'e veya sohbet çıktısına alınmaz.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Yerel ve Linux güvenlik testleri | Her ortamda 11 test başarılı |
| v63 ayrı port HTTP dosya hashleri | 238 başarılı |
| v63 çevrim dışı dosya manifesti | 235 dosya |
| v63 yetkisiz istek / korumalı yollar | 14 / 6 başarılı |
| Canlı v64 aynı kontroller | 238 / 235 / 14 / 6 başarılı |
| Yerel/uzak onarım betiği SHA-256 | `cae1bff30e112cb16e5392ac859b51aaf91c77aa70878ad49521027dd6268807` |
| Özgün v64 alındısı SHA-256 | `159af26559b082176b860f460d5a84d85ba6f2e5cfc9550804710d5e2cffc40f` — değişmedi |

## Sınırlar ve kalan işler

- Gerçek trafikle v64 → v63 geçişi uygulanmadı; ayrı port testi bu kabulün yerine geçmez.
- Kullanıcı hesabıyla gerçek cihazdan sözlük araması hâlâ kabul testi bekler.
  Güvenlik kontrolünde beklenen 401, gerçek kullanıcı hatası diye sayılmamalıdır.
- Sözlük yönlendirmesi ve iki farklı sözlük modu değiştirilmedi.
- Yerel güvenilirlik paketi değişiklikleri korundu; yeni sürüm, commit, push veya
  master birleştirmesi yapılmadı.
- Her sonraki yayından önce `check` yeniden çalıştırılmalı. Durdurulmuş
  rollback konteynerleri ve ilgili imaj/paketler genel Docker temizliğine
  dahil edilmemeli; bu onarım herhangi bir global temizlik işini değiştirmedi.
- Geri alma komutu yalnız bu v64 canlı konteyneri ve bu v63 hedefi için geçerlidir.

